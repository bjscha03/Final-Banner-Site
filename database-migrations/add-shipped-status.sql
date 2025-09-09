-- Add 'shipped' status to orders table check constraint
-- This allows orders to be marked as shipped when tracking is added

-- Drop the existing check constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new check constraint that includes 'shipped'
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'shipped'));

-- Update any existing orders with tracking numbers to have 'shipped' status
UPDATE orders 
SET status = 'shipped' 
WHERE tracking_number IS NOT NULL 
  AND tracking_number != '' 
  AND status = 'paid';
