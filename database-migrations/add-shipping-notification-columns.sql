-- Add shipping notification tracking columns to orders table
-- This migration is idempotent and safe to run multiple times

-- Add shipping notification tracking columns
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS shipping_notification_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shipping_notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for performance on shipping notification queries
CREATE INDEX IF NOT EXISTS idx_orders_shipping_notification_sent 
  ON orders(shipping_notification_sent);

-- Create index for performance on shipping notification timestamp queries
CREATE INDEX IF NOT EXISTS idx_orders_shipping_notification_sent_at 
  ON orders(shipping_notification_sent_at);

-- Verify the columns were added
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
    AND column_name IN ('shipping_notification_sent', 'shipping_notification_sent_at')
ORDER BY column_name;
