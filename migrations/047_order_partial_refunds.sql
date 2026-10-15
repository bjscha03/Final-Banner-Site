-- Manual records of refunds already issued through the payment provider.
-- Totals are cumulative, so saving the same amount twice never adds a refund.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS partial_refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (partial_refund_cents >= 0),
  ADD COLUMN IF NOT EXISTS partial_refund_tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (partial_refund_tax_cents >= 0 AND partial_refund_tax_cents <= partial_refund_cents),
  ADD COLUMN IF NOT EXISTS partial_refund_history JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(partial_refund_history) = 'array');
