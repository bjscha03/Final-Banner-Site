'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { tokenHash } = require('./outbound-delivery.cjs');
const { appendAudit } = require('./audit.cjs');

function html(statusCode, title, message, showConfirmation = false) {
  // The opaque bearer token stays in the request URL and is never reflected
  // into rendered HTML, logs, audit metadata, or browser-facing JSON.
  const form = showConfirmation ? '<form method="post"><button type="submit">Confirm unsubscribe</button></form>' : '';
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" },
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:40px}main{max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 8px 30px #0f172a1f}h1{color:#18448D}button{background:#ff6b35;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:700}</style></head><body><main><h1>${title}</h1><p>${message}</p>${form}</main></body></html>`,
  };
}

function requestToken(event) {
  if (event.httpMethod === 'GET') return String(event.queryStringParameters?.token || '');
  const contentType = String(event.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try { return String(JSON.parse(event.body || '{}').token || ''); } catch { return ''; }
  }
  return String(new URLSearchParams(event.body || '').get('token') || event.queryStringParameters?.token || '');
}

function validToken(value) { return /^[a-zA-Z0-9_-]{32,128}$/.test(String(value || '')); }

async function applyUnsubscribe(sql, token) {
  if (typeof sql.transaction !== 'function') throw new Error('Atomic unsubscribe transaction is unavailable.');
  const hash = tokenHash(token);
  const [rows] = await sql.transaction((tx) => [tx(
    `WITH token_row AS (
       SELECT * FROM outbound_unsubscribe_tokens
        WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()
        FOR UPDATE
     ), used AS (
       UPDATE outbound_unsubscribe_tokens t SET used_at=NOW()
        FROM token_row WHERE t.id=token_row.id
       RETURNING token_row.*
     ), suppressed AS (
       INSERT INTO outbound_suppressions (
         scope, normalized_value, reason, source, prospect_id, contact_id,
         message_id, evidence, active, updated_at
       ) SELECT 'email',LOWER(c.email_normalized),'unsubscribed','webhook',
                used.prospect_id,used.contact_id,used.message_id,
                jsonb_build_object('unsubscribeTokenId',used.id),TRUE,NOW()
           FROM used JOIN outbound_contacts c ON c.id=used.contact_id
       ON CONFLICT (scope,normalized_value) DO UPDATE
         SET reason='unsubscribed',source='webhook',prospect_id=EXCLUDED.prospect_id,
             contact_id=EXCLUDED.contact_id,message_id=EXCLUDED.message_id,
             evidence=EXCLUDED.evidence,active=TRUE,updated_at=NOW()
       RETURNING prospect_id
     ), prospect_update AS (
       UPDATE outbound_prospects p SET status='unsubscribed',updated_at=NOW()
        FROM suppressed WHERE p.id=suppressed.prospect_id RETURNING p.id
     ), counter_update AS (
       INSERT INTO outbound_daily_delivery_counters (business_date,unsubscribed_count)
       SELECT CURRENT_DATE,1 FROM used
       ON CONFLICT (business_date) DO UPDATE
         SET unsubscribed_count=outbound_daily_delivery_counters.unsubscribed_count+1,
             updated_at=NOW()
       RETURNING business_date
     ) SELECT id,prospect_id,contact_id,message_id FROM used`, [hash],
  )], { isolationLevel: 'Serializable' });
  return rows?.[0] || null;
}

function createUnsubscribeHandler(dependencies = {}) {
  return async function handler(event) {
    if (!['GET','POST'].includes(event.httpMethod)) return html(405, 'Method not allowed', 'Use the unsubscribe link from the email.');
    const token = requestToken(event);
    if (!validToken(token) || !getDatabaseUrl()) return html(400, 'Link unavailable', 'This unsubscribe link is invalid or has expired.');
    if (event.httpMethod === 'GET') return html(200, 'Unsubscribe', 'Confirm that you no longer want outbound sales email from Banners On The Fly.', true);
    try {
      const sql = (dependencies.createSql || createSql)();
      const result = await (dependencies.applyUnsubscribe || applyUnsubscribe)(sql, token);
      if (result) await (dependencies.appendAudit || appendAudit)(sql, { actorType: 'webhook', action: 'contact.unsubscribed', entityType: 'prospect', entityId: result.prospect_id, newValues: { status: 'unsubscribed' }, metadata: { source: 'one_click', messageId: result.message_id }, requestId: event.headers?.['x-nf-request-id'] || null });
      return html(200, 'Unsubscribed', 'You will not receive further outbound sales email from us.');
    } catch (error) {
      if (isMissingOutboundSchema(error)) return html(400, 'Link unavailable', 'This unsubscribe link is invalid or has expired.');
      return html(500, 'Unable to unsubscribe', 'We could not process this request. Please contact support and we will remove the address manually.');
    }
  };
}

module.exports = { html, requestToken, validToken, applyUnsubscribe, createUnsubscribeHandler, handler: createUnsubscribeHandler() };
