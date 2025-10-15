-- ============================================================================
-- COMPREHENSIVE ORDER_ITEMS TABLE MIGRATION
-- ============================================================================
-- This migration adds ALL missing columns to the order_items table
-- to match what the application code expects.
--
-- Missing columns identified:
-- - pole_pockets, pole_pocket_size, pole_pocket_position, pole_pocket_cost_cents, pole_pocket_pricing_mode
-- - rope_cost_cents, rope_pricing_mode
-- - area_sqft, unit_price_cents
-- - file_key, file_name, file_url, print_ready_url, web_preview_url
-- - text_elements, overlay_image, transform, preview_canvas_px
-- ============================================================================

-- Add pole pocket columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pole_pockets VARCHAR(50) DEFAULT 'none';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pole_pocket_size VARCHAR(50);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pole_pocket_position VARCHAR(50);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pole_pocket_cost_cents INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pole_pocket_pricing_mode VARCHAR(20) DEFAULT 'per_item';

-- Add rope pricing columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS rope_cost_cents INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS rope_pricing_mode VARCHAR(20) DEFAULT 'per_item';

-- Add pricing breakdown columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS area_sqft NUMERIC(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_cents INTEGER DEFAULT 0;

-- Add file/image columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS file_key VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS print_ready_url TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS web_preview_url TEXT;

-- Add design data columns (JSONB for structured data)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS text_elements JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS overlay_image JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS transform JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS preview_canvas_px JSONB;
