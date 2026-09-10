-- Migration: 011_final_render_snapshot.sql
-- Adds columns to store high-resolution canvas snapshot for admin PDF
-- This ensures pixel-perfect PDF reproduction of what user saw at checkout

-- All columns are NULLABLE - old orders wont have this data
-- The PDF renderer will fallback to existing logic when final_render_url is NULL

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS final_render_url TEXT;

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS final_render_file_key TEXT;

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS final_render_width_px INTEGER;

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS final_render_height_px INTEGER;

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS final_render_dpi INTEGER;

-- Comments for documentation
COMMENT ON COLUMN order_items.final_render_url IS 
  'Cloudinary URL of high-res canvas snapshot captured at checkout';

COMMENT ON COLUMN order_items.final_render_file_key IS 
  'Cloudinary public_id for direct access to the snapshot';

COMMENT ON COLUMN order_items.final_render_width_px IS 
  'Width in pixels of the snapshot (banner_in * DPI)';

COMMENT ON COLUMN order_items.final_render_height_px IS 
  'Height in pixels of the snapshot (banner_in * DPI)';

COMMENT ON COLUMN order_items.final_render_dpi IS 
  'DPI used when rendering the snapshot (typically 150)';
