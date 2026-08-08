-- AI credit PayPal payment integrity.
-- Additive only: existing completed purchases and balances are not rewritten.

ALTER TABLE credit_purchases
  ADD COLUMN IF NOT EXISTS package_key TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payment_reconciliation_status TEXT,
  ADD COLUMN IF NOT EXISTS paypal_create_request_id TEXT,
  ADD COLUMN IF NOT EXISTS paypal_capture_request_id TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;

-- Do not guess which historical row owns a duplicated provider transaction.
-- Stop the migration and require reconciliation instead of deleting or merging
-- revenue records automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM credit_purchases
     WHERE paypal_order_id IS NOT NULL
     GROUP BY paypal_order_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'credit_purchases contains duplicate paypal_order_id values; reconcile before migration 029';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM credit_purchases
     WHERE paypal_capture_id IS NOT NULL
     GROUP BY paypal_capture_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'credit_purchases contains duplicate paypal_capture_id values; reconcile before migration 029';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_checkout_key_uidx
  ON credit_purchases (checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_paypal_order_uidx
  ON credit_purchases (paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_paypal_capture_uidx
  ON credit_purchases (paypal_capture_id)
  WHERE paypal_capture_id IS NOT NULL;

-- Written in the same statement that grants credits. Delivery is claimed with
-- a lease and uses a stable provider idempotency key, so browser/webhook races
-- cannot intentionally send the receipt twice.
CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox (
  purchase_id TEXT PRIMARY KEY REFERENCES credit_purchases(id) ON DELETE CASCADE,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  lease_started_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN credit_purchases.package_key IS
  'Server-owned credit package identifier used to derive credits and price.';
COMMENT ON COLUMN credit_purchases.checkout_idempotency_key IS
  'Unique browser checkout attempt key, bound to one authenticated account and package.';
COMMENT ON COLUMN credit_purchases.payment_reconciliation_status IS
  'Provider/finalization state: awaiting_provider, awaiting_capture, required, complete, or not_required.';
COMMENT ON COLUMN credit_purchases.credited_at IS
  'Set in the same atomic statement that increments user_credits.';
COMMENT ON TABLE credit_purchase_notification_outbox IS
  'Durable once-only customer receipt queue for completed AI-credit purchases.';
