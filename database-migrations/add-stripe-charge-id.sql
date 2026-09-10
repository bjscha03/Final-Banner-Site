-- Add Stripe charge id + wallet type columns to orders table.
-- This migration is idempotent and safe to run multiple times.
--
-- After running this migration, the stripe-finalize-order /
-- stripe-webhook flow can persist:
--   * stripe_charge_id   - the charge id behind the PaymentIntent
--                          (paid out, refunded, dispute target, etc).
--   * stripe_wallet_type - 'apple_pay' | 'google_pay' | 'link' | null
--                          (null when a regular card was used).
-- Existing orders are unaffected.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_wallet_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Lookup index for charge id (Stripe dashboard -> our admin).
CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge_id
  ON orders(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('stripe_charge_id', 'stripe_wallet_type', 'customer_phone')
ORDER BY column_name;
