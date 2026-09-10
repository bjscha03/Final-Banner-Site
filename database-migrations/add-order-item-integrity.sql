-- Bind checkout/payment idempotency identities to the exact item payload that
-- was committed with the order. New order writes set both fields atomically.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS expected_item_count INTEGER,
  ADD COLUMN IF NOT EXISTS item_signature TEXT;

COMMENT ON COLUMN orders.expected_item_count IS
  'Number of order_items that must exist for an idempotent retry to be returned as success.';

COMMENT ON COLUMN orders.item_signature IS
  'SHA-256 of the normalized persisted item payload, used to reject idempotency-key reuse with a different cart.';
