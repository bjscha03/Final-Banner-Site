'use strict';

const { neon } = require('@neondatabase/serverless');
const { ensureAbandonedCartSchema } = require('./abandoned-cart-schema.cjs');
const { verifyRecoveryUnsubscribeToken } = require('./cart-recovery-token.cjs');

let neonFactory = neon;
let ensureSchema = ensureAbandonedCartSchema;

const MAX_BODY_LENGTH = 8_192;
const MAX_TOKEN_LENGTH = 2_048;
const TOKEN_PATTERN = /^u1(?:\.[A-Za-z0-9_-]+){4}$/;

const pageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(statusCode, title, message, content = '') {
  return {
    statusCode,
    headers: pageHeaders,
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:40px}main{max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 8px 30px #0f172a1f}h1{color:#18448D}button{border:0;border-radius:8px;background:#18448D;color:#fff;font-weight:700;padding:12px 18px;cursor:pointer}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${content}</main></body></html>`,
  };
}

function confirmationPage(token) {
  return page(
    200,
    'Confirm unsubscribe',
    'Confirm that you no longer want cart-recovery emails from Banners On The Fly.',
    `<form method="post" action="/.netlify/functions/recovery-email-unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><input type="hidden" name="confirm" value="unsubscribe"><button type="submit">Unsubscribe</button></form>`,
  );
}

function requestToken(event) {
  const queryToken = String(event.queryStringParameters?.token || '').trim();
  if (queryToken) return queryToken;
  const contentType = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try { return String(JSON.parse(event.body || '{}').token || '').trim(); } catch { return ''; }
  }
  return String(new URLSearchParams(event.body || '').get('token') || '').trim();
}

function isOneClickPost(event) {
  if (event.httpMethod !== 'POST') return false;
  const contentType = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
  if (contentType.includes('application/json')) return false;
  return new URLSearchParams(event.body || '').get('List-Unsubscribe') === 'One-Click';
}

function isConfirmationPost(event) {
  if (event.httpMethod !== 'POST') return false;
  const contentType = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const confirmation = JSON.parse(event.body || '{}').confirm;
      return confirmation === true || confirmation === 'unsubscribe';
    } catch {
      return false;
    }
  }
  return new URLSearchParams(event.body || '').get('confirm') === 'unsubscribe';
}

async function recordUnsubscribe(sql, email, source) {
  const rows = await sql`
    WITH recorded AS (
      INSERT INTO recovery_email_suppressions (
        normalized_email, reason, source, active, created_at, updated_at
      ) VALUES (
        ${email}, 'unsubscribed', ${source}, TRUE, NOW(), NOW()
      )
      ON CONFLICT (normalized_email) DO UPDATE
        SET reason = 'unsubscribed', source = EXCLUDED.source, active = TRUE, updated_at = NOW()
      RETURNING normalized_email
    ), suppressed_carts AS (
      UPDATE abandoned_carts AS cart
         SET recovery_suppressed_at = COALESCE(cart.recovery_suppressed_at, NOW()),
             recovery_suppression_reason = 'recovery_email_suppressions:unsubscribed',
             recovery_email_claim_sequence = NULL,
             recovery_email_claimed_at = NULL,
             recovery_email_last_error = NULL,
             updated_at = NOW()
        FROM recorded
       WHERE COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email))) = recorded.normalized_email
         AND cart.recovery_status IN ('active', 'abandoned')
       RETURNING cart.id
    ), suppressed_deliveries AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'suppressed', failure_reason = 'recipient_unsubscribed', updated_at = NOW()
       WHERE delivery.abandoned_cart_id IN (SELECT id FROM suppressed_carts)
         AND delivery.status = 'claimed'
       RETURNING delivery.id
    )
    SELECT normalized_email FROM recorded
  `;
  return rows[0] || null;
}

async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return page(405, 'Method not allowed', 'Use the unsubscribe link from the recovery email.');
  }
  if (typeof event.body === 'string' && event.body.length > MAX_BODY_LENGTH) {
    return page(413, 'Request too large', 'The unsubscribe request is too large.');
  }
  const token = requestToken(event);
  if (!token || token.length > MAX_TOKEN_LENGTH || !TOKEN_PATTERN.test(token)) {
    return page(400, 'Link unavailable', 'This unsubscribe link is invalid or has expired.');
  }
  const claims = verifyRecoveryUnsubscribeToken(token);
  if (!claims) return page(400, 'Link unavailable', 'This unsubscribe link is invalid or has expired.');

  // Automated email-security scanners routinely follow GET links. Only show a
  // confirmation page here; mutation requires the form POST or RFC one-click.
  if (event.httpMethod === 'GET') return confirmationPage(token);
  if (!isOneClickPost(event) && !isConfirmationPost(event)) {
    return page(400, 'Confirmation required', 'Please confirm the unsubscribe request from the recovery email link.');
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!dbUrl) {
    return page(503, 'Unable to unsubscribe', 'Please contact info@bannersonthefly.com and we will remove this address manually.');
  }
  try {
    const sql = neonFactory(dbUrl);
    await ensureSchema(sql);
    const source = isOneClickPost(event) ? 'list_unsubscribe' : 'footer_confirmation';
    await recordUnsubscribe(sql, claims.email, source);
    return page(200, 'Unsubscribed', 'You will not receive any more cart-recovery emails from Banners On The Fly.');
  } catch (error) {
    console.error('[recovery-email-unsubscribe] request failed', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
    return page(500, 'Unable to unsubscribe', 'Please contact info@bannersonthefly.com and we will remove this address manually.');
  }
}

module.exports = {
  handler,
  _test: {
    MAX_BODY_LENGTH,
    MAX_TOKEN_LENGTH,
    confirmationPage,
    isConfirmationPost,
    isOneClickPost,
    recordUnsubscribe,
    requestToken,
    resetDependencies() {
      neonFactory = neon;
      ensureSchema = ensureAbandonedCartSchema;
    },
    setEnsureSchema(value) { ensureSchema = value; },
    setNeonFactory(value) { neonFactory = value; },
  },
};
