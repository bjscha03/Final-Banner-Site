const { neon } = require('@neondatabase/serverless');
const { getPayPalDescription } = require('./product-display-helpers.cjs');
const { ACTIVE_ORDER_STATUSES, captureFromOrder, matchesInternalOrder, orderIdentity, recordAttempt } = require('./paypal-payment-safety.cjs');

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function credentials() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) throw new Error('PAYPAL_NOT_CONFIGURED');
  return { clientId, secret, baseUrl: env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' };
}
async function token(config) {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!response.ok) throw new Error('PAYPAL_AUTH_FAILED');
  return (await response.json()).access_token;
}
async function retrieve(baseUrl, accessToken, id) {
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`PAYPAL_RETRIEVE_FAILED_${response.status}`);
  return response.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  // Fail closed before credentials, database, or PayPal are touched.
  if (process.env.FEATURE_PAYPAL !== '1') return reply(503, { ok: false, error: 'PAYPAL_DISABLED', message: 'PayPal payments are temporarily unavailable.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }
  const internalOrderId = String(payload.internalOrderId || '').trim();
  if (!internalOrderId) return reply(400, { ok: false, error: 'INTERNAL_ORDER_REQUIRED' });
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });

  try {
    const sql = neon(dbUrl);
    const rows = await sql`SELECT id, status, total_cents, currency, paypal_order_id, paypal_capture_id, checkout_idempotency_key FROM orders WHERE id = ${internalOrderId} LIMIT 1`;
    if (!rows.length) return reply(404, { ok: false, error: 'INTERNAL_ORDER_NOT_FOUND' });
    const order = rows[0];
    if (!['pending', 'paid'].includes(order.status)) return reply(409, { ok: false, error: 'INTERNAL_ORDER_NOT_PAYABLE' });
    if (!Number.isInteger(Number(order.total_cents)) || Number(order.total_cents) <= 0 || String(order.currency || 'usd').toUpperCase() !== 'USD') return reply(409, { ok: false, error: 'AUTHORITATIVE_TOTAL_INVALID' });
    if (payload.totalCents != null && Number(payload.totalCents) !== Number(order.total_cents)) return reply(409, { ok: false, error: 'PAYPAL_AMOUNT_MISMATCH' });

    const config = credentials();
    const accessToken = await token(config);
    if (order.paypal_order_id) {
      const existing = await retrieve(config.baseUrl, accessToken, order.paypal_order_id);
      if (existing && !matchesInternalOrder(existing, order)) return reply(409, { ok: false, error: 'PAYPAL_ORDER_IDENTITY_MISMATCH' });
      const completed = captureFromOrder(existing);
      if (completed || (order.status === 'paid' && order.paypal_capture_id)) {
        return reply(200, { ok: true, alreadyPaid: true, paymentCaptured: true, paypalOrderId: order.paypal_order_id, captureID: completed?.id || order.paypal_capture_id, internalOrderId });
      }
      if (existing && ACTIVE_ORDER_STATUSES.has(existing.status)) return reply(200, { ok: true, reused: true, paypalOrderId: existing.id, internalOrderId });
      // Replacement is allowed only for a PayPal-confirmed terminal/unavailable order.
      if (existing && !['VOIDED', 'EXPIRED'].includes(existing.status)) return reply(409, { ok: false, error: 'PAYPAL_ORDER_NOT_REPLACEABLE' });
    }

    const requestId = `create-${internalOrderId}`;
    const body = { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: (Number(order.total_cents) / 100).toFixed(2) }, description: getPayPalDescription(Array.isArray(payload.items) ? payload.items : []).slice(0, 127), custom_id: internalOrderId, invoice_id: `BOTF-${internalOrderId}` }], application_context: { brand_name: 'Banners On The Fly', user_action: 'PAY_NOW', shipping_preference: 'GET_FROM_FILE' } };
    const response = await fetch(`${config.baseUrl}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'PayPal-Request-Id': requestId }, body: JSON.stringify(body) });
    const paypalOrder = await response.json().catch(() => ({}));
    const identity = orderIdentity(paypalOrder);
    await recordAttempt(sql, { internalOrderId, checkoutKey: order.checkout_idempotency_key, paypalOrderId: paypalOrder.id, requestId, source: 'create', orderStatus: paypalOrder.status, amountCents: identity.amountCents, currency: identity.currency, invoiceId: identity.invoiceId, customId: identity.customId, processingStatus: response.ok ? 'created' : 'error', errorCode: response.ok ? null : 'PAYPAL_CREATE_FAILED', raw: paypalOrder });
    if (!response.ok || !paypalOrder.id) return reply(502, { ok: false, error: 'PAYPAL_CREATE_FAILED' });

    const linked = await sql`UPDATE orders SET paypal_order_id = ${paypalOrder.id}, payment_method = 'paypal', payment_reconciliation_status = 'awaiting_capture', updated_at = NOW() WHERE id = ${internalOrderId} AND status = 'pending' AND (paypal_order_id IS NULL OR paypal_order_id = ${order.paypal_order_id || null}) RETURNING paypal_order_id`;
    if (linked.length) return reply(200, { ok: true, paypalOrderId: linked[0].paypal_order_id, internalOrderId });
    const winner = await sql`SELECT paypal_order_id, paypal_capture_id, status FROM orders WHERE id = ${internalOrderId} LIMIT 1`;
    if (winner[0]?.paypal_order_id) return reply(200, { ok: true, reused: true, paypalOrderId: winner[0].paypal_order_id, internalOrderId });
    return reply(409, { ok: false, error: 'PAYPAL_ORDER_LINK_CONFLICT' });
  } catch (error) {
    console.error('[paypal-create-order]', error);
    return reply(500, { ok: false, error: 'PAYPAL_CREATE_INTERNAL_ERROR' });
  }
};
exports._test = { retrieve };
