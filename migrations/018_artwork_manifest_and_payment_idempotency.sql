-- Canonical immutable customer artwork metadata and idempotent payment lifecycle.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS artwork_manifest JSONB,
  ADD COLUMN IF NOT EXISTS placement_preview JSONB,
  ADD COLUMN IF NOT EXISTS production_pdf_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS production_pdf_error TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payment_reconciliation_status TEXT DEFAULT 'not_required';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_idempotency_key
  ON orders (checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id_unique
  ON orders (paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_capture_id_unique
  ON orders (paypal_capture_id)
  WHERE paypal_capture_id IS NOT NULL;

-- Backfill the minimum safe legacy manifest without claiming unavailable metadata.
UPDATE order_items
SET artwork_manifest = jsonb_strip_nulls(jsonb_build_object(
  'originalUrl', file_url,
  'publicId', file_key,
  'originalFilename', file_name,
  'uploadStatus', CASE WHEN file_url IS NOT NULL OR file_key IS NOT NULL THEN 'uploaded' ELSE 'failed' END
))
WHERE artwork_manifest IS NULL AND (file_url IS NOT NULL OR file_key IS NOT NULL);
