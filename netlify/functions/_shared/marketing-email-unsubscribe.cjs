'use strict';

const { neon } = require('@neondatabase/serverless');
const marketingStore = require('./marketing-email-store.cjs');
const marketingToken = require('./marketing-email-token.cjs');

let neonFactory = neon;
let ensureSchema = marketingStore.ensureMarketingEmailSchema;

const PAGE_HEADERS = {
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
    headers: PAGE_HEADERS,
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:32px 16px;background:#eef3f8;color:#172033;font-family:Arial,sans-serif}main{max-width:560px;margin:40px auto;background:#fff;border-radius:18px;padding:32px;box-shadow:0 10px 35px rgba(15,45,92,.14);border-top:5px solid #ff5a1f}h1{margin:0 0 14px;color:#18448d;font-size:28px}p{line-height:1.65}button{margin-top:10px;border:0;border-radius:9px;background:#ff5a1f;color:#fff;padding:13px 20px;font-size:15px;font-weight:800;cursor:pointer}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${content}</main></body></html>`,
  };
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
  return event.httpMethod === 'POST'
    && new URLSearchParams(event.body || '').get('List-Unsubscribe') === 'One-Click';
}

function isConfirmationPost(event) {
  if (event.httpMethod !== 'POST') return false;
  return new URLSearchParams(event.body || '').get('confirm') === 'unsubscribe';
}

async function findSend(sql, token) {
  const tokenHash = marketingToken.hashMarketingUnsubscribeToken(token);
  const rows = await sql`
    SELECT id, normalized_email, campaign_key, status
      FROM marketing_email_sends
     WHERE unsubscribe_token_hash = ${tokenHash}
     LIMIT 1
  `;
  return rows[0] || null;
}

async function recordUnsubscribe(sql, send, source) {
  await sql`
    WITH suppressed AS (
      INSERT INTO marketing_email_suppressions (
        normalized_email, reason, source, campaign_key, active, first_recorded_at, updated_at
      ) VALUES (
        ${send.normalized_email}, 'unsubscribe', ${source}, ${send.campaign_key}, TRUE, NOW(), NOW()
      )
      ON CONFLICT (normalized_email) DO UPDATE
        SET reason = 'unsubscribe', source = EXCLUDED.source, campaign_key = EXCLUDED.campaign_key,
            active = TRUE, updated_at = NOW()
      RETURNING normalized_email
    )
    UPDATE marketing_email_sends
       SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, NOW()), updated_at = NOW()
     WHERE normalized_email IN (SELECT normalized_email FROM suppressed)
       AND status IN ('processing', 'sent', 'error')
  `;
}

async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return page(405, 'Method not allowed', 'Use the unsubscribe link from the email.');
  if (typeof event.body === 'string' && event.body.length > 8192) return page(413, 'Request too large', 'The unsubscribe request is too large.');
  const token = requestToken(event);
  if (!marketingToken.TOKEN_PATTERN.test(token)) return page(400, 'Link unavailable', 'This unsubscribe link is invalid.');
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!dbUrl) return page(503, 'Unable to unsubscribe', 'Please contact support@bannersonthefly.com and we will remove this address manually.');

  try {
    const sql = neonFactory(dbUrl);
    await ensureSchema(sql);
    const send = await findSend(sql, token);
    if (!send) return page(400, 'Link unavailable', 'This unsubscribe link is invalid.');
    if (event.httpMethod === 'GET') {
      return page(
        200,
        'Confirm unsubscribe',
        'Confirm that you no longer want promotional emails from Banners On The Fly.',
        `<form method="post" action="/.netlify/functions/marketing-email-unsubscribe?token=${encodeURIComponent(token)}"><input type="hidden" name="confirm" value="unsubscribe"><button type="submit">Unsubscribe</button></form>`,
      );
    }
    if (!isOneClickPost(event) && !isConfirmationPost(event)) return page(400, 'Confirmation required', 'Please confirm the unsubscribe request.');
    await recordUnsubscribe(sql, send, isOneClickPost(event) ? 'list_unsubscribe' : 'footer_link');
    return page(200, 'Unsubscribed', 'You will no longer receive promotional emails from Banners On The Fly.');
  } catch (error) {
    console.error('[marketing-email-unsubscribe] request failed', { code: error?.code || null, message: error?.message || String(error) });
    return page(500, 'Unable to unsubscribe', 'Please contact support@bannersonthefly.com and we will remove this address manually.');
  }
}

module.exports = {
  handler,
  _test: {
    findSend,
    isConfirmationPost,
    isOneClickPost,
    recordUnsubscribe,
    requestToken,
    resetDependencies() {
      neonFactory = neon;
      ensureSchema = marketingStore.ensureMarketingEmailSchema;
    },
    setEnsureSchema(value) { ensureSchema = value; },
    setNeonFactory(value) { neonFactory = value; },
  },
};
