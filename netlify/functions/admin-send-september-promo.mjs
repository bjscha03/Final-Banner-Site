import '@neondatabase/serverless';
import 'resend';
import crypto from 'node:crypto';
import { withLambda } from '@netlify/aws-lambda-compat';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import serverAuth from './_shared/server-auth.cjs';
import customerAnalytics from './_shared/admin-customers.cjs';
import suppressionModule from './_shared/email-suppression.cjs';
import marketingStore from './_shared/marketing-email-store.cjs';
import marketingToken from './_shared/marketing-email-token.cjs';
import promotionPolicy from './_shared/recovery-discount-policy.cjs';
import {
  buildSeptemberPromoEmail,
  SEPTEMBER_PROMO_SUBJECT,
} from '../../src/lib/marketing/septemberPromoEmail.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Authorization, X-Banners-Admin-Session, Cookie, Origin',
};

const reply = (statusCode, body) => ({ statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) });
const databaseUrl = () => process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;

let neonFactory = neon;
let resendFactory = (apiKey) => new Resend(apiKey);
let ensureSchema = marketingStore.ensureMarketingEmailSchema;
let findEmailSuppression = suppressionModule.findEmailSuppression;
let nowFactory = () => new Date();

function parseBody(event, maxBytes = 12 * 1024) {
  const raw = String(event.body || '');
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    const error = new Error('Request body is too large.');
    error.code = 'REQUEST_TOO_LARGE';
    throw error;
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function allowedOrigins(event) {
  const proto = String(event.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hosts = [event.headers?.host, event.headers?.['x-forwarded-host']]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const result = new Set(hosts.map((host) => `${proto}://${host}`));
  for (const candidate of [event.rawUrl, process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL]) {
    try { if (candidate) result.add(new URL(String(candidate)).origin); } catch { /* ignore */ }
  }
  return result;
}

function requireSameOrigin(event) {
  const origin = String(event.headers?.origin || '').trim();
  let approvedPreview = false;
  try {
    const siteName = String(process.env.SITE_NAME || '').trim().toLowerCase();
    const originUrl = new URL(origin);
    approvedPreview = Boolean(siteName
      && originUrl.protocol === 'https:'
      && (originUrl.hostname === `${siteName}.netlify.app`
        || originUrl.hostname.endsWith(`--${siteName}.netlify.app`)));
  } catch { approvedPreview = false; }
  return Boolean(origin && (allowedOrigins(event).has(origin) || approvedPreview));
}

function normalizeName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 160 || /[\u0000-\u001F\u007F]/.test(name)) return null;
  return name;
}

function requestId(event, body) {
  const value = String(event.headers?.['x-idempotency-key'] || body.requestId || '').trim();
  return /^[A-Za-z0-9_-]{16,100}$/.test(value) ? value : null;
}

function providerIdempotencyKey(email) {
  const digest = crypto.createHash('sha256')
    .update(`${marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY}\0${email}`)
    .digest('hex')
    .slice(0, 40);
  return `bof-september-promo/${digest}`;
}

function safeProviderError(value) {
  const text = typeof value === 'string' ? value : value?.message || JSON.stringify(value || {});
  return String(text || 'Email provider rejected the message').replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 1000);
}

async function loadVerifiedCustomer(sql, email) {
  const rows = await sql`
    SELECT COALESCE(
             NULLIF(TRIM(to_jsonb(o)->>'customer_name'), ''),
             NULLIF(TRIM(to_jsonb(o)->>'shipping_name'), ''),
             NULLIF(TRIM(to_jsonb(p)->>'full_name'), '')
           ) AS customer_name
      FROM orders o
      LEFT JOIN profiles p ON p.id = o.user_id
     WHERE COALESCE(
             NULLIF(LOWER(TRIM(to_jsonb(o)->>'email')), ''),
             NULLIF(LOWER(TRIM(to_jsonb(p)->>'email')), '')
           ) = ${email}
       AND LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) <> 'true'
       AND LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) <> 'admin_deploy_preview_test'
       AND (
         LOWER(TRIM(COALESCE(o.status::text, ''))) IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
         OR (
           LOWER(TRIM(COALESCE(o.status::text, ''))) = 'pending'
           AND (
             NULLIF(TRIM(to_jsonb(o)->>'paypal_capture_id'), '') IS NOT NULL
             OR (
               LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) = 'paypal'
               AND LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_reconciliation_status', ''))) = 'complete'
             )
           )
         )
       )
     ORDER BY o.created_at DESC
     LIMIT 1
  `;
  return rows[0] || null;
}

async function claimSend(sql, input) {
  const rows = await sql`
    INSERT INTO marketing_email_sends (
      campaign_key, normalized_email, recipient_email, recipient_name, subject,
      sending_admin_id, sending_admin_email, status, request_id,
      provider_idempotency_key, unsubscribe_token_hash, attempt_count,
      last_attempt_at, created_at, updated_at
    ) VALUES (
      ${marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY}, ${input.email}, ${input.email},
      ${input.name || null}, ${SEPTEMBER_PROMO_SUBJECT}, ${input.session.sub || null},
      ${input.session.email || null}, 'processing', ${input.requestId},
      ${input.providerKey}, ${input.unsubscribeTokenHash}, 1, NOW(), NOW(), NOW()
    )
    ON CONFLICT (campaign_key, normalized_email) DO UPDATE
      SET recipient_email = EXCLUDED.recipient_email,
          recipient_name = EXCLUDED.recipient_name,
          sending_admin_id = EXCLUDED.sending_admin_id,
          sending_admin_email = EXCLUDED.sending_admin_email,
          status = 'processing',
          request_id = EXCLUDED.request_id,
          attempt_count = marketing_email_sends.attempt_count + 1,
          error_message = NULL,
          last_attempt_at = NOW(),
          updated_at = NOW()
      WHERE marketing_email_sends.status = 'error'
         OR (
           marketing_email_sends.status = 'processing'
           AND marketing_email_sends.last_attempt_at < NOW() - (${marketingStore.SEPTEMBER_PROMO_PROCESSING_LEASE_MINUTES} * INTERVAL '1 minute')
         )
    RETURNING id, status, attempt_count
  `;
  if (rows.length) return { claimed: true, row: rows[0] };
  const previous = await sql`
    SELECT id, status, sent_at, resend_message_id, error_message
      FROM marketing_email_sends
     WHERE campaign_key = ${marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY}
       AND normalized_email = ${input.email}
     LIMIT 1
  `;
  return { claimed: false, row: previous[0] || null };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...JSON_HEADERS,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session, X-Idempotency-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
  const auth = serverAuth.requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (!requireSameOrigin(event)) return reply(403, { ok: false, error: 'This request must come from the same site.' });

  try {
    const body = parseBody(event);
    const email = customerAnalytics.normalizeEmail(body.email);
    const suppliedName = normalizeName(body.customerName);
    const stableRequestId = requestId(event, body);
    if (!customerAnalytics.isValidCustomerEmail(email)) return reply(400, { ok: false, error: 'A valid customer email is required.' });
    if (!stableRequestId) return reply(400, { ok: false, error: 'A valid idempotency key is required.' });
    const promotionWindow = promotionPolicy.septemberLargeBannerWindow(nowFactory());
    if (!promotionWindow.active) {
      return reply(409, {
        ok: false,
        status: 'blocked',
        error: promotionWindow.reason === 'not_started'
          ? 'The September promotion cannot be sent before September 1, 2026.'
          : 'The September promotion ended after September 8, 2026 and can no longer be sent.',
      });
    }
    const dbUrl = databaseUrl();
    if (!dbUrl) return reply(503, { ok: false, error: 'Database is not configured.' });
    const sql = neonFactory(dbUrl);
    await ensureSchema(sql);

    const customer = await loadVerifiedCustomer(sql, email);
    if (!customer) return reply(404, { ok: false, error: 'This address is not attached to a verified previous customer.' });
    const suppression = await findEmailSuppression(sql, email);
    if (suppression.suppressed) {
      return reply(409, {
        ok: false,
        suppressed: true,
        error: 'This customer is suppressed or unsubscribed and cannot receive promotional email.',
      });
    }

    const customerName = suppliedName || normalizeName(customer.customer_name) || email;
    const unsubscribeToken = marketingToken.createMarketingUnsubscribeToken(
      email,
      marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY,
    );
    const unsubscribeTokenHash = marketingToken.hashMarketingUnsubscribeToken(unsubscribeToken);
    const unsubscribeUrl = marketingToken.buildMarketingUnsubscribeUrl(unsubscribeToken);
    const providerKey = providerIdempotencyKey(email);
    const claim = await claimSend(sql, {
      email,
      name: customerName,
      requestId: stableRequestId,
      providerKey,
      session: auth.session,
      unsubscribeTokenHash,
    });
    if (!claim.claimed) {
      if (claim.row?.status === 'sent') {
        return reply(200, {
          ok: true,
          duplicate: true,
          status: 'sent',
          sentAt: claim.row.sent_at ? new Date(claim.row.sent_at).toISOString() : null,
          messageId: claim.row.resend_message_id || null,
        });
      }
      if (claim.row?.status === 'processing') {
        return reply(409, { ok: false, duplicate: true, status: 'processing', error: 'This September deal email is already sending.' });
      }
      return reply(409, { ok: false, duplicate: true, status: claim.row?.status || 'blocked', error: 'This customer cannot receive the September deal again.' });
    }

    if (!process.env.RESEND_API_KEY) {
      const message = 'Resend is not configured for this deployment.';
      await sql`UPDATE marketing_email_sends SET status = 'error', error_message = ${message}, updated_at = NOW() WHERE id = ${claim.row.id}`;
      return reply(503, { ok: false, status: 'error', error: message });
    }

    const physicalAddress = process.env.MARKETING_PHYSICAL_ADDRESS
      || process.env.OUTBOUND_PHYSICAL_ADDRESS
      || process.env.RECOVERY_PHYSICAL_ADDRESS
      || 'PO Box 369, Crestwood, KY 40014';
    const emailContent = buildSeptemberPromoEmail({ unsubscribeUrl, physicalAddress });
    const fromRaw = process.env.SEPTEMBER_PROMO_FROM
      || process.env.EMAIL_FROM_INFO
      || process.env.EMAIL_FROM
      || 'info@bannersonthefly.com';
    const from = fromRaw.includes('<') ? fromRaw : `Banners On The Fly <${fromRaw}>`;
    const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    try {
      const resend = resendFactory(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from,
        to: email,
        replyTo,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [
          { name: 'type', value: 'customer_promotion' },
          { name: 'campaign', value: marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY },
        ],
      }, { idempotencyKey: providerKey, signal: AbortSignal.timeout(15_000) });
      if (result?.error || !result?.data?.id) throw result?.error || new Error('Resend did not return a message ID.');
      const updated = await sql`
        UPDATE marketing_email_sends
           SET status = 'sent', resend_message_id = ${result.data.id}, sent_at = NOW(),
               error_message = NULL, updated_at = NOW()
         WHERE id = ${claim.row.id}
         RETURNING sent_at
      `;
      return reply(200, {
        ok: true,
        status: 'sent',
        messageId: result.data.id,
        sentAt: updated[0]?.sent_at ? new Date(updated[0].sent_at).toISOString() : new Date().toISOString(),
      });
    } catch (error) {
      const providerError = safeProviderError(error);
      await sql`
        UPDATE marketing_email_sends
           SET status = 'error', error_message = ${providerError}, updated_at = NOW()
         WHERE id = ${claim.row.id}
      `;
      console.error('[admin-send-september-promo] delivery failed', { sendId: claim.row.id, code: error?.name || error?.code || null });
      return reply(502, { ok: false, status: 'error', error: 'The September deal email could not be sent. You can safely retry.' });
    }
  } catch (error) {
    console.error('[admin-send-september-promo] request failed', { code: error?.code || null, message: error?.message || String(error) });
    const status = error?.code === 'INVALID_JSON' ? 400 : error?.code === 'REQUEST_TOO_LARGE' ? 413 : 500;
    return reply(status, { ok: false, error: status === 500 ? 'Unable to send the September deal email.' : error.message });
  }
}

export const _test = {
  claimSend,
  loadVerifiedCustomer,
  normalizeName,
  providerIdempotencyKey,
  requestId,
  resetDependencies() {
    neonFactory = neon;
    resendFactory = (apiKey) => new Resend(apiKey);
    ensureSchema = marketingStore.ensureMarketingEmailSchema;
    findEmailSuppression = suppressionModule.findEmailSuppression;
    nowFactory = () => new Date();
  },
  setEnsureSchema(value) { ensureSchema = value; },
  setFindEmailSuppression(value) { findEmailSuppression = value; },
  setNeonFactory(value) { neonFactory = value; },
  setNowFactory(value) { nowFactory = value; },
  setResendFactory(value) { resendFactory = value; },
};

export default withLambda(handler);
