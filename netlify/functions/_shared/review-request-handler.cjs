'use strict';

const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
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

async function sendReviewEmailWithRetry(resend, payload, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await resend.emails.send(payload);
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
        SELECT sent_at, customer_email, resend_message_id
          FROM review_request_history
         WHERE order_id = ${orderId}
           AND status = 'sent'
         ORDER BY sent_at DESC
         LIMIT 1
      `;
      return rows[0] || null;
    },

    async beginAttempt({ orderId, customerEmail, adminIdentifier }) {
      await sql`
        UPDATE review_request_history
           SET status = 'failed',
               failure_reason = COALESCE(failure_reason, 'Sending attempt expired before completion')
         WHERE order_id = ${orderId}
           AND status = 'sending'
           AND requested_at < NOW() - INTERVAL '10 minutes'
      `;
      const rows = await sql`
        INSERT INTO review_request_history (
          order_id,
          customer_email,
          admin_identifier,
          status,
          requested_at
        )
        VALUES (${orderId}, ${customerEmail}, ${adminIdentifier || null}, 'sending', NOW())
        ON CONFLICT DO NOTHING
        RETURNING id, requested_at
      `;
      return rows[0] || null;
    },

    async completeAttempt({ attemptId, providerMessageId }) {
      const rows = await sql`
        UPDATE review_request_history
           SET status = 'sent',
               sent_at = NOW(),
               resend_message_id = ${providerMessageId},
               failure_reason = NULL
         WHERE id = ${attemptId}
           AND status = 'sending'
        RETURNING sent_at
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
  orderId,
  confirmedPreviousSentAt,
  adminIdentifier,
  data,
  sendEmail,
  emailConfig,
}) {
  const order = await data.loadOrder(orderId);
  if (!order) throw new ReviewRequestError(404, 'ORDER_NOT_FOUND', 'Order not found.');

  const eligibility = getReviewRequestEligibility(order);
  if (!eligibility.eligible) {
    throw new ReviewRequestError(422, eligibility.code, eligibility.reason);
  }

  const latestSent = await data.loadLatestSent(orderId);
  if (latestSent && !timestampsMatch(confirmedPreviousSentAt, latestSent.sent_at)) {
    throw new ReviewRequestError(
      409,
      'REVIEW_REQUEST_ALREADY_SENT',
      'A review request has already been sent. Confirm the resend to continue.',
      {
        lastSentAt: latestSent.sent_at,
        customerEmail: eligibility.customerEmail,
      },
    );
  }

  const attempt = await data.beginAttempt({
    orderId,
    customerEmail: eligibility.customerEmail,
    adminIdentifier,
  });
  if (!attempt) {
    throw new ReviewRequestError(
      409,
      'REVIEW_REQUEST_IN_PROGRESS',
      'A review request for this order is already being sent. Please wait before trying again.',
    );
  }

  const payload = createReviewRequestEmailData({
    order,
    customerEmail: eligibility.customerEmail,
    from: emailConfig.from,
    replyTo: emailConfig.replyTo,
  });

  let providerMessageId;
  try {
    const result = await sendEmail(payload);
    providerMessageId = result?.data?.id || result?.id || '';
    if (!providerMessageId) throw new Error('Resend did not return a message ID');
  } catch (error) {
    const failureReason = normalizeProviderError(error);
    try {
      await data.failAttempt({ attemptId: attempt.id, failureReason });
    } catch (auditError) {
      console.error('[review-request] failed to finalize rejected attempt', {
        orderId,
        attemptId: attempt.id,
        error: normalizeProviderError(auditError),
      });
    }
    await data.logEmailEvent({ orderId, customerEmail: eligibility.customerEmail, status: 'error', failureReason });
    console.error('[review-request] send failed', {
      orderId,
      attemptId: attempt.id,
      providerStatus: getProviderStatus(error),
      error: failureReason,
    });
    throw new ReviewRequestError(
      502,
      'REVIEW_REQUEST_SEND_FAILED',
      'The review email could not be sent. Please try again.',
    );
  }

  let completed;
  try {
    completed = await data.completeAttempt({ attemptId: attempt.id, providerMessageId });
  } catch (auditError) {
    console.error('[review-request] provider accepted email but audit update threw', {
      orderId,
      attemptId: attempt.id,
      providerMessageId,
      error: normalizeProviderError(auditError),
    });
  }
  if (!completed?.sent_at) {
    console.error('[review-request] provider accepted email but audit completion failed', {
      orderId,
      attemptId: attempt.id,
      providerMessageId,
    });
    throw new ReviewRequestError(
      500,
      'REVIEW_REQUEST_AUDIT_FAILED',
      'The email provider accepted the message, but its audit record could not be finalized. Please check the order history before retrying.',
    );
  }

  await data.logEmailEvent({
    orderId,
    customerEmail: eligibility.customerEmail,
    status: 'sent',
    providerMessageId,
  });

  return {
    customerEmail: eligibility.customerEmail,
    sentAt: completed.sent_at,
    providerMessageId,
  };
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
      confirmedPreviousSentAt: typeof body.confirmedPreviousSentAt === 'string'
        ? body.confirmedPreviousSentAt
        : null,
      adminIdentifier: auth.session.email || auth.session.sub || null,
      data,
      sendEmail: (payload) => sendReviewEmailWithRetry(resend, payload),
      emailConfig: { from, replyTo },
    });

    return jsonResponse(200, {
      ok: true,
      message: 'Review request sent successfully.',
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
