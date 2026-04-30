-- Same-Day Hit Service columns on orders table.
-- Idempotent and safe to re-run. Existing rows get FALSE / 0 / NULL defaults.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS same_day_hit_service BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS saturday_delivery     BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS same_day_fee_cents    INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS saturday_fee_cents    INTEGER DEFAULT 0;

-- Eastern-time wall clock string captured at order creation
-- (e.g. "2026-04-30 11:59:00 ET"). Useful for ops to audit cutoff edge cases.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_timestamp_et    TEXT;

-- The server's authoritative "did this order qualify for Same-Day at the
-- moment of payment" decision. May differ from the customer-selected flag
-- if the cutoff was crossed between cart and checkout.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS same_day_qualified    BOOLEAN DEFAULT FALSE;

-- Quick lookup for ops dashboards filtering today's same-day priority orders.
CREATE INDEX IF NOT EXISTS idx_orders_same_day_hit_service
  ON orders (same_day_hit_service)
  WHERE same_day_hit_service = TRUE;

-- Verify the columns were added.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN (
    'same_day_hit_service',
    'saturday_delivery',
    'same_day_fee_cents',
    'saturday_fee_cents',
    'order_timestamp_et',
    'same_day_qualified'
  )
ORDER BY column_name;
