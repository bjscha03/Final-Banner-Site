-- Per-panel originals, exact placement and print-ready PDFs for specialty products.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS specialty_config JSONB;
