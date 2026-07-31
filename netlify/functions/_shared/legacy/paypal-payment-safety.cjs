const ACTIVE_ORDER_STATUSES = new Set(['CREATED', 'SAVED', 'APPROVED', 'PAYER_ACTION_REQUIRED']);

const amountToCents = (value) => {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value || ''))) return null;
  return Math.round(Number(value) * 100);
};

const captureFromOrder = (order) => order?.purchase_units?.flatMap((unit) => unit?.payments?.captures || [])
  .find((capture) => capture?.status === 'COMPLETED') || null;

const orderIdentity = (order) => {
  const unit = order?.purchase_units?.[0] || {};
  return {
    customId: unit.custom_id || null,
    invoiceId: unit.invoice_id || null,
    currency: unit.amount?.currency_code || null,
    amountCents: amountToCents(unit.amount?.value),
  };
};

const matchesInternalOrder = (paypalOrder, internalOrder) => {
  const identity = orderIdentity(paypalOrder);
  return identity.customId === String(internalOrder.id)
    && identity.invoiceId === `BOTF-${internalOrder.id}`
    && identity.currency === 'USD'
    && identity.amountCents === Number(internalOrder.total_cents);
};

const sanitizePayPal = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const clone = JSON.parse(JSON.stringify(payload));
  delete clone.payment_source;
  delete clone.links;
  return clone;
};

async function recordAttempt(sql, attempt) {
  const raw = sanitizePayPal(attempt.raw);
  await sql`
    INSERT INTO paypal_payment_attempts (
      internal_order_id, checkout_idempotency_key, paypal_order_id, paypal_capture_id,
      paypal_event_id, request_id, source, paypal_order_status, capture_status,
      amount_cents, currency, payer_email, payer_id, invoice_id, custom_id,
      processing_status, duplicate_suspected, error_code, error_message, raw_paypal_response, updated_at
    ) VALUES (
      ${attempt.internalOrderId || null}, ${attempt.checkoutKey || null}, ${attempt.paypalOrderId || null},
      ${attempt.captureId || null}, ${attempt.eventId || null}, ${attempt.requestId || null},
      ${attempt.source}, ${attempt.orderStatus || null}, ${attempt.captureStatus || null},
      ${attempt.amountCents ?? null}, ${attempt.currency || null}, ${attempt.payerEmail || null},
      ${attempt.payerId || null}, ${attempt.invoiceId || null}, ${attempt.customId || null},
      ${attempt.processingStatus || 'received'}, ${Boolean(attempt.duplicateSuspected)},
      ${attempt.errorCode || null}, ${attempt.errorMessage || null}, ${raw ? JSON.stringify(raw) : null}::jsonb, NOW()
    )
    ON CONFLICT DO NOTHING
  `;
}

module.exports = { ACTIVE_ORDER_STATUSES, amountToCents, captureFromOrder, orderIdentity, matchesInternalOrder, recordAttempt, sanitizePayPal };
