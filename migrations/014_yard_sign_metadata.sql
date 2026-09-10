-- Migration: Add yard sign metadata columns to order_items
-- These columns store yard sign-specific data for the new Yard Signs product type.
-- Existing banner orders are unaffected (all columns are nullable with sensible defaults).

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS yard_sign_sidedness TEXT,
  ADD COLUMN IF NOT EXISTS yard_sign_step_stakes_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS yard_sign_step_stakes_qty INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yard_sign_design_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yard_sign_designs JSONB,
  ADD COLUMN IF NOT EXISTS yard_sign_signs_subtotal_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yard_sign_stakes_subtotal_cents INTEGER DEFAULT 0;
