-- Phase 1: Product Type Registry - add product_type column to order_items
-- This is a backward-compatible, additive migration.
-- Existing rows default to 'banner'.
-- The column is nullable with a DEFAULT so existing code is unaffected.

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'banner';

-- Note: The auto-migration blocks in create-order.cjs, get-orders.cjs,
-- and get-order.cjs also run this ADD COLUMN IF NOT EXISTS statement,
-- so this migration file is a safety net for manual runs.
