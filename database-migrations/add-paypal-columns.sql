-- Add PayPal-related columns to orders table
-- This migration is idempotent and safe to run multiple times

-- Add PayPal order tracking columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Create unique index on paypal_order_id for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id);

-- Create index on paypal_capture_id for lookups
CREATE INDEX IF NOT EXISTS idx_orders_paypal_capture_id ON orders(paypal_capture_id);

-- Create index on customer_name for searches
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('paypal_order_id', 'paypal_capture_id', 'customer_name')
ORDER BY column_name;
