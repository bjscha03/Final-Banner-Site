-- Admin Order Notification Database Migration
-- Run this in your Neon database console to add admin notification tracking

-- Add admin notification columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS admin_notification_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS admin_notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for admin notification status queries
CREATE INDEX IF NOT EXISTS idx_orders_admin_notification_status ON orders(admin_notification_status);

-- Verify the migration worked
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
    AND column_name IN ('admin_notification_status', 'admin_notification_sent_at')
ORDER BY column_name;

-- Check recent orders to see if columns exist
SELECT 
    id,
    email,
    confirmation_email_status,
    admin_notification_status,
    created_at
FROM orders 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 5;
