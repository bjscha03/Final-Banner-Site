-- Migration: Add per-user promo code tracking
-- This allows tracking which users have used which promo codes
-- Supports one-time-per-customer and limited-use promo codes

-- Add columns for per-user tracking
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS used_by_email TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS used_by_user_id TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS max_uses_per_customer INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_total_uses INTEGER DEFAULT NULL;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_discount_codes_used_by_email 
ON discount_codes USING GIN(used_by_email);

CREATE INDEX IF NOT EXISTS idx_discount_codes_used_by_user_id 
ON discount_codes USING GIN(used_by_user_id);

-- Add comment
COMMENT ON COLUMN discount_codes.used_by_email IS 'Array of email addresses that have used this code';
COMMENT ON COLUMN discount_codes.used_by_user_id IS 'Array of user IDs that have used this code';
COMMENT ON COLUMN discount_codes.max_uses_per_customer IS 'Maximum times a single customer can use this code (default 1)';
COMMENT ON COLUMN discount_codes.max_total_uses IS 'Maximum total uses across all customers (NULL = unlimited)';
