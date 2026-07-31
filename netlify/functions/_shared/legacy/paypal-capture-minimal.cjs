const { neon } = require('@neondatabase/serverless');
const { captureFromOrder, matchesInternalOrder, orderIdentity, recordAttempt } = require('./paypal-payment-safety.cjs');
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
function config() { const env = process.env.PAYPAL_ENV || 'sandbox'; const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`]; const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`]; if (!clientId || !secret) throw new Error('PAYPAL_NOT_CONFIGURED'); return { env, clientId, secret, baseUrl: env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' }; }
async function accessToken(c) { const r = await fetch(`${c.baseUrl}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }); if (!r.ok) throw new Error('PAYPAL_AUTH_FAILED'); return (await r.json()).access_token; }
async function alertReconciliation(order, details) {
  const url = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  if (!url || !secret) return;
  await fetch(`${url}/.netlify/functions/payment-reconciliation-alert`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Job-Secret': secret }, body: JSON.stringify({ priority: 'P0', internalOrderId: order.id, customer: order.email, amountCents: order.total_cents, ...details }) }).catch((error) => console.error('[paypal-capture] reconciliation alert failed', error));
}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (process.env.FEATURE_PAYPAL !== '1') return reply(503, { ok: false, error: 'PAYPAL_DISABLED', message: 'PayPal payments are temporarily unavailable.' });
  let input; try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }
  const orderID = String(input.orderID || '').trim(); const internalOrderId = String(input.internalOrderId || '').trim();
  if (!orderID || !internalOrderId) return reply(400, { ok: false, error: 'ORDER_IDENTIFIERS_REQUIRED' });
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const sql = neon(dbUrl);
    const rows = await sql`SELECT id, status, total_cents, currency, email, paypal_order_id, paypal_capture_id, checkout_idempotency_key FROM orders WHERE id = ${internalOrderId} LIMIT 1`;
    if (!rows.length) return reply(404, { ok: false, error: 'INTERNAL_ORDER_NOT_FOUND' });
    const order = rows[0];
    // This check deliberately precedes OAuth and every PayPal call, especially POST /capture.
    if (order.paypal_order_id !== orderID) {
      await recordAttempt(sql, { internalOrderId, checkoutKey: order.checkout_idempotency_key, paypalOrderId: orderID, source: 'capture', processingStatus: 'rejected_before_capture', duplicateSuspected: true, errorCode: 'PAYPAL_ORDER_LINK_MISMATCH' });
      return reply(409, { ok: false, error: 'PAYPAL_ORDER_LINK_MISMATCH' });
    }
    if (!['pending', 'paid'].includes(order.status)) return reply(409, { ok: false, error: 'INTERNAL_ORDER_NOT_PAYABLE' });
    if (order.status === 'paid') {
      if (order.paypal_order_id === orderID && order.paypal_capture_id) return reply(200, { success: true, alreadyPaid: true, paymentCaptured: true, status: 'COMPLETED', captureStatus: 'COMPLETED', captureID: order.paypal_capture_id, paypalOrderID: orderID, internalOrderId });
      return reply(409, { ok: false, error: 'DIFFERENT_CAPTURE_ALREADY_COMPLETED', duplicateSuspected: true });
    }
    const c = config(); const token = await accessToken(c);
    const detailResponse = await fetch(`${c.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!detailResponse.ok) return reply(409, { ok: false, error: 'PAYPAL_ORDER_UNAVAILABLE' });
    const details = await detailResponse.json(); const identity = orderIdentity(details);
    if (!matchesInternalOrder(details, order)) return reply(409, { ok: false, error: identity.currency !== 'USD' || identity.amountCents !== Number(order.total_cents) ? 'PAYPAL_AMOUNT_MISMATCH' : 'PAYPAL_ORDER_IDENTITY_MISMATCH' });
    const existingCapture = captureFromOrder(details);
    let captureData = details;
    if (!existingCapture) {
      const captureResponse = await fetch(`${c.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `capture-${orderID}` } });
      captureData = await captureResponse.json().catch(() => ({}));
      if (!captureResponse.ok) return reply(400, { ok: false, error: 'PAYPAL_CAPTURE_FAILED' });
    }
    const completed = captureFromOrder(captureData) || existingCapture;
    if (!completed || completed.status !== 'COMPLETED') return reply(409, { ok: false, error: 'PAYPAL_CAPTURE_NOT_COMPLETED' });
    const captureAmount = orderIdentity({ purchase_units: [{ amount: completed.amount }] }).amountCents;
    if (completed.amount?.currency_code !== 'USD' || captureAmount !== Number(order.total_cents)) return reply(409, { ok: false, error: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH', paymentCaptured: completed.status === 'COMPLETED' });
    try {
      await recordAttempt(sql, { internalOrderId, checkoutKey: order.checkout_idempotency_key, paypalOrderId: orderID, captureId: completed.id, requestId: `capture-${orderID}`, source: 'capture', orderStatus: captureData.status, captureStatus: completed.status, amountCents: captureAmount, currency: completed.amount.currency_code, payerEmail: captureData.payer?.email_address, payerId: captureData.payer?.payer_id, invoiceId: identity.invoiceId, customId: identity.customId, processingStatus: 'captured', raw: captureData });
      const paid = await sql`UPDATE orders SET status = 'paid', paypal_capture_id = ${completed.id}, payment_method = 'paypal', payment_reconciliation_status = 'complete', updated_at = NOW() WHERE id = ${internalOrderId} AND status = 'pending' AND paypal_order_id = ${orderID} AND total_cents = ${captureAmount} AND paypal_capture_id IS NULL RETURNING id`;
      if (!paid.length) throw new Error('ORDER_FINALIZATION_COMPARE_AND_SET_FAILED');
    } catch (error) {
      console.error('[paypal-capture] completed capture requires reconciliation', { internalOrderId, orderID, captureID: completed.id, error: error.message });
      await alertReconciliation(order, { paypalOrderID: orderID, captureID: completed.id, error: error.message });
      return reply(202, { ok: true, paymentCaptured: true, reconciliationRequired: true, captureID: completed.id, paypalOrderID: orderID, internalOrderId });
    }
    return reply(200, { success: true, paymentCaptured: true, reconciliationRequired: false, status: 'COMPLETED', captureStatus: 'COMPLETED', captureID: completed.id, paypalOrderID: orderID, orderID, internalOrderId, capturedAmountCents: captureAmount, capturedCurrency: 'USD', paypalData: captureData });
  } catch (error) { console.error('[paypal-capture]', error); return reply(500, { ok: false, error: 'PAYPAL_CAPTURE_INTERNAL_ERROR' }); }
};
