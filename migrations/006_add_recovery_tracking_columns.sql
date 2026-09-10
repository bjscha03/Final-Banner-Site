-- ============================================================================
-- ADD RECOVERY TRACKING COLUMNS TO ABANDONED CARTS
-- Migration 006
-- Created: 2025-10-25
-- ============================================================================

-- Add recovered_at column (timestamp when cart was recovered via purchase)
ALTER TABLE abandoned_carts 
ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ;

-- Add recovered_order_id column (reference to the order that recovered this cart)
ALTER TABLE abandoned_carts 
ADD COLUMN IF NOT EXISTS recovered_order_id TEXT;

-- Add index for faster queries on recovered carts
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovered 
ON abandoned_carts(recovery_status, recovered_at);

-- Add index for order lookups
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_order_id 
ON abandoned_carts(recovered_order_id) 
WHERE recovered_order_id IS NOT NULL;

-- Update existing recovered carts to have a recovered_at timestamp
-- (Use updated_at as a best guess for when they were recovered)
UPDATE abandoned_carts 
SET recovered_at = updated_at 
WHERE recovery_status = 'recovered' AND recovered_at IS NULL;

-- Add comment to document the columns
COMMENT ON COLUMN abandoned_carts.recovered_at IS 'Timestamp when the customer completed their purchase, recovering this abandoned cart';
COMMENT ON COLUMN abandoned_carts.recovered_order_id IS 'Order ID that recovered this cart (from orders table)';

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'abandoned_carts'
AND column_name IN ('recovered_at', 'recovered_order_id')
ORDER BY column_name;

-- Show summary of recovery status
SELECT 
    recovery_status,
    COUNT(*) as count,
    COUNT(recovered_at) as with_timestamp,
    COUNT(recovered_order_id) as with_order_id
FROM abandoned_carts
GROUP BY recovery_status
ORDER BY recovery_status;
