-- ============================================================================
-- Pricing Unification - Database Migration
-- ============================================================================
-- This migration adds fields to the order_items table to support:
-- - Complete pricing breakdowns
-- - Pole pocket details (size, position)
-- - Pole pricing (when ordered as add-on)
-- - File metadata
-- ============================================================================

-- Add new columns to order_items table
ALTER TABLE order_items

-- Area and unit pricing
ADD COLUMN IF NOT EXISTS area_sqft DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS unit_price_cents INTEGER,

-- Individual cost breakdowns
ADD COLUMN IF NOT EXISTS rope_cost_cents INTEGER,
ADD COLUMN IF NOT EXISTS pole_pocket_cost_cents INTEGER,

-- Pricing modes
ADD COLUMN IF NOT EXISTS rope_pricing_mode VARCHAR(20) DEFAULT 'per_item',
ADD COLUMN IF NOT EXISTS pole_pocket_pricing_mode VARCHAR(20) DEFAULT 'per_item',

-- Pole pocket details
ADD COLUMN IF NOT EXISTS pole_pocket_size VARCHAR(10),
ADD COLUMN IF NOT EXISTS pole_pocket_position VARCHAR(20),

-- Poles add-on pricing
ADD COLUMN IF NOT EXISTS poles_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS poles_unit_price_cents INTEGER,
ADD COLUMN IF NOT EXISTS poles_total_cents INTEGER,

-- File metadata
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN order_items.area_sqft IS 'Banner area in square feet';
COMMENT ON COLUMN order_items.unit_price_cents IS 'Base banner price per unit in cents';
COMMENT ON COLUMN order_items.rope_cost_cents IS 'Total rope cost in cents';
COMMENT ON COLUMN order_items.pole_pocket_cost_cents IS 'Total pole pocket cost in cents';
COMMENT ON COLUMN order_items.rope_pricing_mode IS 'Rope pricing mode: per_item or per_order';
COMMENT ON COLUMN order_items.pole_pocket_pricing_mode IS 'Pole pocket pricing mode: per_item or per_order';
COMMENT ON COLUMN order_items.pole_pocket_size IS 'Pole pocket size in inches (e.g., "2", "3")';
COMMENT ON COLUMN order_items.pole_pocket_position IS 'Pole pocket position (e.g., "top", "bottom", "top-bottom")';
COMMENT ON COLUMN order_items.poles_quantity IS 'Number of poles ordered';
COMMENT ON COLUMN order_items.poles_unit_price_cents IS 'Price per pole in cents';
COMMENT ON COLUMN order_items.poles_total_cents IS 'Total poles cost in cents';
COMMENT ON COLUMN order_items.file_name IS 'Original filename';
COMMENT ON COLUMN order_items.file_url IS 'URL to uploaded file';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_order_items_pole_pockets ON order_items(pole_pocket_position) WHERE pole_pocket_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_poles ON order_items(poles_quantity) WHERE poles_quantity > 0;

-- Verification query
-- Run this after migration to verify columns were added:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'order_items'
-- ORDER BY ordinal_position;
