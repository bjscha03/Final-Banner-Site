'use strict';

const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { randomBytes } = require('node:crypto');
const { requireAdmin } = require('./server-auth.cjs');
const {
  createReviewRequestEmailData,
  getReviewRequestEligibility,
} = require('./review-request-email.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class ReviewRequestError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = 'ReviewRequestError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

function isValidOrderId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function timestampsMatch(left, right) {
  const leftMs = new Date(left || '').getTime();
  const rightMs = new Date(right || '').getTime();
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function normalizeProviderError(error) {
  const raw = typeof error === 'string'
    ? error
    : error?.message || error?.name || 'Email provider rejected the request';
  return String(raw)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:re_|sk_)[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]')
    .slice(0, 1000);
}

function getProviderStatus(error) {
  const value = Number(error?.statusCode ?? error?.status ?? error?.code);
  return Number.isFinite(value) ? value : null;
}

function isRetryableProviderError(error) {
  const status = getProviderStatus(error);
  const message = normalizeProviderError(error).toLowerCase();
  return status === 429
    || (status !== null && status >= 500 && status < 600)
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('temporarily unavailable');
}

async function sendReviewEmailWithRetry(resend, payload, maxAttempts = 3, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await resend.emails.send(payload, options);
      if (result?.error) {
        const providerError = new Error(normalizeProviderError(result.error));
        providerError.statusCode = getProviderStatus(result.error);
        throw providerError;
      }
      if (!result?.data?.id) throw new Error('Resend did not return a message ID');
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 750 : 2000));
    }
  }
  throw lastError || new Error('Email provider rejected the request');
}

async function ensureReviewRequestSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS review_request_history (
      id BIGSERIAL PRIMARY KEY,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      customer_email TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      resend_message_id TEXT,
      admin_identifier TEXT,
      status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
      failure_reason TEXT
    )
  `;
  await sql`
    ALTER TABLE review_request_history
      ADD COLUMN IF NOT EXISTS email_kind TEXT NOT NULL DEFAULT 'initial',
      ADD COLUMN IF NOT EXISTS offer_percentage INTEGER NOT NULL DEFAULT 25,
      ADD COLUMN IF NOT EXISTS email_payload JSONB,
      ADD COLUMN IF NOT EXISTS provider_started_at TIMESTAMPTZ
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS review_coupon_rewards (
      order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL REFERENCES discount_codes(code),
      customer_email TEXT NOT NULL,
      offer_percentage INTEGER NOT NULL CHECK (offer_percentage IN (25, 30)),
      review_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      admin_identifier TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS review_request_history_one_sending_per_order_idx
      ON review_request_history (order_id)
      WHERE status = 'sending'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS review_request_history_order_sent_idx
      ON review_request_history (order_id, sent_at DESC)
      WHERE status = 'sent'
  `;
}

function createDataAccess(sql) {
  return {
    async loadOrder(orderId) {
      const rows = await sql`
        SELECT o.*, p.email AS profile_email, p.full_name AS profile_full_name
          FROM orders o
          LEFT JOIN profiles p ON o.user_id = p.id
         WHERE o.id = ${orderId}
         LIMIT 1
      `;
      return rows[0] || null;
    },

    async loadLatestSent(orderId) {
      const rows = await sql`
        SELECT sent_at, customer_email, resend_message_id, email_kind, offer_percentage
          FROM review_request_history
         WHERE order_id = ${orderId}
           AND status = 'sent' AND email_kind <> 'coupon'
         ORDER BY sent_at DESC
         LIMIT 1
      `;
      return rows[0] || null;
    },

    async loadCoupon(orderId) {
      const rows = await sql`
        SELECT r.*, d.used, d.order_id AS redeemed_order_id
          FROM review_coupon_rewards r JOIN discount_codes d ON d.code = r.code
         WHERE r.order_id = ${orderId}
      `;
      return rows[0] || null;
    },

    async createCoupon({ orderId, customerEmail, percentage, adminIdentifier }) {
      const code = `THANKS${percentage}-${randomBytes(6).toString('hex').toUpperCase()}`;
      // Both writes are one atomic statement. discount_codes.order_id must stay
      // NULL: checkout uses it to reserve the coupon for a FUTURE purchase.
      const rows = await sql`
        WITH new_code AS (
          INSERT INTO discount_codes (
            code, discount_percentage, email, single_use, used,
            max_uses_per_customer, max_total_uses, campaign, expires_at
          ) VALUES (
            ${code}, ${percentage}, ${customerEmail}, TRUE, FALSE,
            1, 1, 'review_thank_you', '2099-12-31T23:59:59Z'
          ) RETURNING code
        )
        INSERT INTO review_coupon_rewards (
          order_id, code, customer_email, offer_percentage, admin_identifier
        ) SELECT ${orderId}, code, ${customerEmail}, ${percentage}, ${adminIdentifier || null}
          FROM new_code
        RETURNING *
      `;
      return rows[0];
    },

    async beginAttempt({ orderId, customerEmail, adminIdentifier, action = 'initial', percentage = 25 }) {
      // Only legacy attempts without a persisted payload can be expired. New
      // deliveries with uncertain provider outcomes retain their idempotency key.
      await sql`
        UPDATE review_request_history
           SET status = 'failed', failure_reason = 'Legacy sending attempt expired before completion'
         WHERE order_id = ${orderId} AND status = 'sending'
           AND email_payload IS NULL AND requested_at < NOW() - INTERVAL '10 minutes'
      `;
      const rows = await sql`
        INSERT INTO review_request_history (
          order_id, customer_email, admin_identifier, status, requested_at, email_kind, offer_percentage
        ) VALUES (${orderId}, ${customerEmail}, ${adminIdentifier || null}, 'sending', NOW(), ${action}, ${percentage})
        ON CONFLICT DO NOTHING
        RETURNING id, requested_at, email_payload, customer_email, offer_percentage
      `;
      if (rows[0]) return rows[0];
      // Resume the identical payload only inside Resend's 24-hour idempotency
      // window. A two-minute lease prevents simultaneous retry workers.
      const resumed = await sql`
        UPDATE review_request_history SET requested_at = NOW()
         WHERE order_id = ${orderId} AND status = 'sending' AND email_kind = ${action}
           AND customer_email = ${customerEmail} AND email_payload IS NOT NULL
           AND requested_at < NOW() - INTERVAL '2 minutes'
           AND provider_started_at > NOW() - INTERVAL '23 hours'
        RETURNING id, requested_at, email_payload, customer_email, offer_percentage
      `;
      return resumed[0] || null;
    },

    async savePayload({ attemptId, payload }) {
      const rows = await sql`
        UPDATE review_request_history
           SET email_payload = ${JSON.stringify(payload)}::jsonb, provider_started_at = NOW()
         WHERE id = ${attemptId} AND status = 'sending' AND email_payload IS NULL
        RETURNING email_payload
      `;
      if (!rows.length) throw new Error('Could not persist the email before delivery');
    },

    async completeAttempt({ attemptId, providerMessageId }) {
      const rows = await sql`
        WITH completed AS (
          UPDATE review_request_history
             SET status = 'sent', sent_at = NOW(), resend_message_id = ${providerMessageId}, failure_reason = NULL
           WHERE id = ${attemptId} AND status = 'sending'
          RETURNING sent_at, order_id, email_kind
        ), reward AS (
          UPDATE review_coupon_rewards r SET sent_at = completed.sent_at
            FROM completed
           WHERE r.order_id = completed.order_id AND completed.email_kind = 'coupon'
          RETURNING r.order_id
        ) SELECT sent_at FROM completed
      `;
      return rows[0] || null;
    },

    async failAttempt({ attemptId, failureReason }) {
      await sql`
        UPDATE review_request_history
           SET status = 'failed',
               failure_reason = ${failureReason}
         WHERE id = ${attemptId}
           AND status = 'sending'
      `;
    },

    async logEmailEvent({ orderId, customerEmail, status, providerMessageId, failureReason }) {
      try {
        await sql`
          INSERT INTO email_events (
            type,
            to_email,
            order_id,
            status,
            provider_msg_id,
            error_message,
            created_at
          )
          VALUES (
            'review.request',
            ${customerEmail},
            ${orderId},
            ${status},
            ${providerMessageId || null},
            ${failureReason || null},
            NOW()
          )
        `;
      } catch (error) {
        console.error('[review-request] secondary email event logging failed', {
          orderId,
          status,
          error: normalizeProviderError(error),
        });
      }
    },
  };
}

async function processReviewRequest({
  orderId, confirmedPreviousSentAt, adminIdentifier, data, sendEmail, emailConfig,
  action = 'initial', reviewVerified = false,
}) {
  if (!['initial', 'followup', 'coupon'].includes(action)) {
    throw new ReviewRequestError(400, 'INVALID_REVIEW_ACTION', 'Choose a valid review email action.');
  }
  const order = await data.loadOrder(orderId);
  if (!order) throw new ReviewRequestError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const eligibility = getReviewRequestEligibility(order);
  if (!eligibility.eligible) throw new ReviewRequestError(422, eligibility.code, eligibility.reason);
  if (action === 'coupon' && reviewVerified !== true) {
    throw new ReviewRequestError(422, 'REVIEW_VERIFICATION_REQUIRED', 'Confirm that you manually verified the customer’s review before sending the coupon.');
  }

  let latestSent = await data.loadLatestSent(orderId);
  let coupon = await data.loadCoupon(orderId);
  const percentageFor = (latest) => latest?.email_kind === 'followup' ? 30 : 25;
  const resultFor = (sentAt, providerMessageId, alreadySent = false) => ({
    customerEmail: coupon?.customer_email || eligibility.customerEmail,
    sentAt: action === 'coupon' ? latestSent.sent_at : sentAt,
    providerMessageId, action, alreadySent,
    offerPercentage: coupon ? Number(coupon.offer_percentage) : (action === 'followup' ? 30 : percentageFor(latestSent)),
    followupSentAt: action === 'followup' ? sentAt : (latestSent?.email_kind === 'followup' ? latestSent.sent_at : null),
    couponCode: coupon?.code || null,
    couponSentAt: action === 'coupon' ? sentAt : (coupon?.sent_at || null),
  });
  const validateState = () => {
    if (action !== 'initial' && !latestSent) {
      throw new ReviewRequestError(409, 'INITIAL_REVIEW_REQUIRED', 'Send the initial review request before using this action.');
    }
    if (latestSent && !timestampsMatch(confirmedPreviousSentAt, latestSent.sent_at)) {
      throw new ReviewRequestError(409, 'REVIEW_REQUEST_ALREADY_SENT', 'The review history changed. Check the updated offer and confirm again.', {
        lastSentAt: latestSent.sent_at, customerEmail: eligibility.customerEmail,
        offerPercentage: percentageFor(latestSent),
        followupSentAt: latestSent.email_kind === 'followup' ? latestSent.sent_at : null,
      });
    }
    if (action !== 'coupon' && coupon) {
      throw new ReviewRequestError(409, 'REVIEW_COUPON_ALREADY_CREATED', 'A coupon has already been created for this order. Use the coupon action to finish delivery.');
    }
    if (action === 'initial' && latestSent?.email_kind === 'followup') {
      throw new ReviewRequestError(409, 'REVIEW_FOLLOWUP_ALREADY_SENT', 'The 30% follow-up has already been sent. The offer cannot be changed back to 25%.');
    }
    if (coupon && coupon.customer_email !== eligibility.customerEmail) {
      throw new ReviewRequestError(409, 'REVIEW_CUSTOMER_CHANGED', 'The order email changed after the coupon was created. Check the customer’s original email before continuing.');
    }
  };
  validateState();
  if (action === 'followup' && latestSent.email_kind === 'followup') {
    return resultFor(latestSent.sent_at, latestSent.resend_message_id, true);
  }
  if (action === 'coupon' && coupon?.sent_at) return resultFor(coupon.sent_at, null, true);

  const percentage = coupon ? Number(coupon.offer_percentage) : (action === 'followup' ? 30 : percentageFor(latestSent));
  const attempt = await data.beginAttempt({ orderId, customerEmail: eligibility.customerEmail, adminIdentifier, action, percentage });
  if (!attempt) {
    throw new ReviewRequestError(409, 'REVIEW_REQUEST_IN_PROGRESS', 'An email for this order is still being processed. Wait two minutes before retrying the same action. If the earlier attempt was over 23 hours ago, check delivery history before retrying.');
  }

  let payload;
  try {
    // Recheck after taking the shared per-order delivery lock. A request that
    // started before another send completed must not duplicate or downgrade it.
    latestSent = await data.loadLatestSent(orderId);
    coupon = await data.loadCoupon(orderId);
    validateState();
    if ((action === 'followup' && latestSent.email_kind === 'followup') || (action === 'coupon' && coupon?.sent_at)) {
      await data.failAttempt({ attemptId: attempt.id, failureReason: 'Already delivered by another request' });
      return resultFor(action === 'coupon' ? coupon.sent_at : latestSent.sent_at, null, true);
    }
    if (action === 'coupon' && !coupon) {
      coupon = await data.createCoupon({ orderId, customerEmail: eligibility.customerEmail, percentage, adminIdentifier });
    }
    payload = attempt.email_payload || createReviewRequestEmailData({
      order, customerEmail: eligibility.customerEmail, ...emailConfig, action, coupon,
    });
    if (!attempt.email_payload) await data.savePayload({ attemptId: attempt.id, payload });
  } catch (error) {
    // No provider request was made by this attempt. A resumed uncertain send
    // must keep its original record, even when current state prevents delivery.
    if (!attempt.email_payload) await data.failAttempt({ attemptId: attempt.id, failureReason: normalizeProviderError(error) });
    throw error;
  }

  let providerMessageId;
  try {
    const result = await sendEmail(payload, { idempotencyKey: `review-request-${orderId}-${action}-${attempt.id}` });
    providerMessageId = result?.data?.id || result?.id || '';
    if (!providerMessageId) throw new Error('Resend did not return a message ID');
  } catch (error) {
    const failureReason = normalizeProviderError(error);
    const status = getProviderStatus(error);
    // Timeouts and 5xx responses can occur after acceptance. Retain the exact
    // payload/key for a safe retry instead of creating another delivery.
    const definitelyRejected = status >= 400 && status < 500 && ![408, 409].includes(status);
    if (definitelyRejected) await data.failAttempt({ attemptId: attempt.id, failureReason });
    await data.logEmailEvent({ orderId, customerEmail: eligibility.customerEmail, status: 'error', failureReason });
    throw new ReviewRequestError(502, 'REVIEW_REQUEST_SEND_FAILED', definitelyRejected
      ? 'The email provider rejected the message. You can retry; any coupon will keep the same code.'
      : 'Email delivery is not confirmed yet. Wait two minutes, then retry the same action to safely recover the original message.');
  }

  let completed;
  try {
    completed = await data.completeAttempt({ attemptId: attempt.id, providerMessageId });
  } catch (error) {
    console.error('[review-request] accepted email audit pending', { orderId, attemptId: attempt.id, providerMessageId, error: normalizeProviderError(error) });
  }
  if (!completed?.sent_at) {
    throw new ReviewRequestError(500, 'REVIEW_REQUEST_AUDIT_FAILED', 'The provider accepted the email, but history could not be saved. Wait two minutes, then retry the same action; the original message and coupon will be reused.');
  }
  await data.logEmailEvent({ orderId, customerEmail: eligibility.customerEmail, status: 'sent', providerMessageId });
  return resultFor(completed.sent_at, providerMessageId);
}

function jsonResponse(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

const handler = async (event) => {
  // Netlify's AWS Lambda compatibility adapter constructs a Fetch Response
  // from this object. A 204 response cannot carry the legacy `body` field, so
  // use the project's established 200 preflight convention.
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, code: 'INVALID_JSON', error: 'Invalid JSON body.' });
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId) return jsonResponse(400, { ok: false, code: 'ORDER_ID_REQUIRED', error: 'Order ID is required.' });
  if (!isValidOrderId(orderId)) return jsonResponse(400, { ok: false, code: 'INVALID_ORDER_ID', error: 'Order ID is invalid.' });

  const dbUrl = getDbUrl();
  if (!dbUrl) return jsonResponse(500, { ok: false, code: 'DATABASE_NOT_CONFIGURED', error: 'Database configuration is missing.' });
  if (!process.env.RESEND_API_KEY) return jsonResponse(500, { ok: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Email configuration is missing.' });

  try {
    const sql = neon(dbUrl);
    await ensureReviewRequestSchema(sql);
    const data = createDataAccess(sql);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromRaw = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'orders@bannersonthefly.com';
    const from = fromRaw.includes('<') ? fromRaw : `Banners on the Fly <${fromRaw}>`;
    const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
    const result = await processReviewRequest({
      orderId,
      action: body.action || 'initial',
      reviewVerified: body.reviewVerified === true,
      confirmedPreviousSentAt: typeof body.confirmedPreviousSentAt === 'string'
        ? body.confirmedPreviousSentAt
        : null,
      adminIdentifier: auth.session.email || auth.session.sub || null,
      data,
      sendEmail: (payload, options) => sendReviewEmailWithRetry(resend, payload, 3, options),
      emailConfig: { from, replyTo },
    });

    return jsonResponse(200, {
      ok: true,
      message: result.alreadySent ? 'This email has already been sent.' : 'Email sent successfully.',
      ...result,
      sentAt: result.sentAt,
      customerEmail: result.customerEmail,
      messageId: result.providerMessageId,
    });
  } catch (error) {
    if (error instanceof ReviewRequestError) {
      return jsonResponse(error.statusCode, {
        ok: false,
        code: error.code,
        error: error.message,
        ...error.details,
      });
    }
    console.error('[review-request] unexpected failure', {
      orderId,
      error: normalizeProviderError(error),
    });
    return jsonResponse(500, {
      ok: false,
      code: 'REVIEW_REQUEST_FAILED',
      error: 'The review request could not be completed. Please try again.',
    });
  }
};

module.exports = {
  handler,
  _test: {
    ReviewRequestError,
    isValidOrderId,
    timestampsMatch,
    normalizeProviderError,
    getProviderStatus,
    isRetryableProviderError,
    sendReviewEmailWithRetry,
    processReviewRequest,
    createDataAccess,
    ensureReviewRequestSchema,
  },
};
