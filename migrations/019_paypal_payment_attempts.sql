-- Durable, append-only evidence for PayPal creation, capture, webhook, and
-- manual reconciliation. Raw payloads must be sanitized by callers.
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
);

CREATE UNIQUE INDEX IF NOT EXISTS paypal_payment_attempts_capture_uidx
  ON paypal_payment_attempts (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS paypal_payment_attempts_event_uidx
  ON paypal_payment_attempts (paypal_event_id) WHERE paypal_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS paypal_payment_attempts_request_uidx
  ON paypal_payment_attempts (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paypal_payment_attempts_order_idx
  ON paypal_payment_attempts (internal_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS paypal_payment_attempts_paypal_order_idx
  ON paypal_payment_attempts (paypal_order_id) WHERE paypal_order_id IS NOT NULL;

