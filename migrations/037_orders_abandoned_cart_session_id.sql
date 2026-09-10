-- Preserve a bounded checkout session hint on orders so a cart snapshot that
-- commits just after checkout can be reconciled server-side. Historical rows
-- remain NULL, and this value is not positive recovery attribution by itself.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-schema-v3')::bigint);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS abandoned_cart_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_session_created_at
  ON orders(abandoned_cart_session_id, created_at DESC)
  WHERE abandoned_cart_session_id IS NOT NULL;

COMMIT;
