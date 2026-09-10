-- Safe, additive migration for Admin customer-information corrections.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_first_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipping_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_street TEXT,
  ADD COLUMN IF NOT EXISTS shipping_street2 TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_state TEXT,
  ADD COLUMN IF NOT EXISTS shipping_zip TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT,
  ADD COLUMN IF NOT EXISTS customer_info_admin_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS order_customer_info_audit (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL,
  previous_values JSONB NOT NULL,
  updated_values JSONB NOT NULL,
  change_reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_customer_info_audit_order_id_idx
  ON order_customer_info_audit(order_id, changed_at DESC);
