-- Add isolated admin/developer test-order markers.
-- Safe for existing production orders: defaults keep all existing rows as non-test.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_test_order BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_order_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_is_test_order
  ON orders(is_test_order)
  WHERE is_test_order = TRUE;
