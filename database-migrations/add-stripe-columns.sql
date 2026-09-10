-- Add Stripe-related columns to orders table.
-- This migration is idempotent and safe to run multiple times.
--
-- After running this migration, the create-order function can persist
-- Stripe payment metadata (payment_intent id + chosen payment_method)
-- alongside the existing PayPal columns. Existing PayPal orders are
-- unaffected.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Unique index for Stripe PaymentIntent IDs to enforce idempotency on
-- repeated webhook deliveries / accidental double-submits. Allows NULLs
-- (PayPal orders won't have a payment_intent id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id
  ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Helpful lookup index when filtering by payment provider.
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('stripe_payment_intent_id', 'payment_method')
ORDER BY column_name;
