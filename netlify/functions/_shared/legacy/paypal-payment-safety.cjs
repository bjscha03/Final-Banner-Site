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

const canBindPayPalOrder = (order) => !order?.stripe_payment_intent_id
  && ['', 'paypal'].includes(String(order?.payment_method || '').trim().toLowerCase());

const isPayPalBoundOrder = (order) => canBindPayPalOrder(order)
  && String(order?.payment_method || '').trim().toLowerCase() === 'paypal'
  && Boolean(order?.paypal_order_id);

const sanitizePayPal = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const clone = JSON.parse(JSON.stringify(payload));
  delete clone.payment_source;
  delete clone.links;
  return clone;
};

let ledgerReady = false;
async function ensurePaymentLedger(sql) {
  if (ledgerReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS paypal_payment_attempts (
      id BIGSERIAL PRIMARY KEY,
      internal_order_id TEXT,
      checkout_idempotency_key TEXT,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      paypal_event_id TEXT,
      request_id TEXT,
      source TEXT NOT NULL CHECK (source IN ('create','approve','capture','webhook','reconciliation')),
      paypal_order_status TEXT,
      capture_status TEXT,
      amount_cents INTEGER,
      currency TEXT,
      payer_email TEXT,
      payer_id TEXT,
      invoice_id TEXT,
      custom_id TEXT,
      processing_status TEXT NOT NULL DEFAULT 'received',
      duplicate_suspected BOOLEAN NOT NULL DEFAULT FALSE,
      error_code TEXT,
      error_message TEXT,
      raw_paypal_response JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS paypal_payment_attempts_capture_uidx ON paypal_payment_attempts (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS paypal_payment_attempts_event_uidx ON paypal_payment_attempts (paypal_event_id) WHERE paypal_event_id IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS paypal_payment_attempts_request_uidx ON paypal_payment_attempts (request_id) WHERE request_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS paypal_payment_attempts_order_idx ON paypal_payment_attempts (internal_order_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS paypal_payment_attempts_paypal_order_idx ON paypal_payment_attempts (paypal_order_id) WHERE paypal_order_id IS NOT NULL`;
  ledgerReady = true;
}

async function recordAttempt(sql, attempt) {
  await ensurePaymentLedger(sql);
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

module.exports = {
  ACTIVE_ORDER_STATUSES,
  amountToCents,
  canBindPayPalOrder,
  captureFromOrder,
  ensurePaymentLedger,
  isPayPalBoundOrder,
  matchesInternalOrder,
  orderIdentity,
  recordAttempt,
  sanitizePayPal,
};
