-- Cache metadata for versioned production PDF rendering.
-- These columns let the renderer invalidate stale/blurry PDFs when the
-- print scene, source artwork, banner dimensions, or renderer changes.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS generated_print_pdf_renderer_version TEXT,
  ADD COLUMN IF NOT EXISTS generated_print_pdf_scene_hash TEXT,
  ADD COLUMN IF NOT EXISTS generated_print_pdf_metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_order_items_print_pdf_cache_v2
  ON order_items (generated_print_pdf_renderer_version, generated_print_pdf_scene_hash)
  WHERE generated_print_pdf_url IS NOT NULL;
