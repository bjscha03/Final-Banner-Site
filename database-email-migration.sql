-- Database migration for transactional email system
-- Run these commands in your Neon database console

-- Update email_events table structure
ALTER TABLE email_events 
ADD COLUMN IF NOT EXISTS type VARCHAR(50),
ADD COLUMN IF NOT EXISTS order_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Update emails table if it doesn't have the right columns
ALTER TABLE emails 
ADD COLUMN IF NOT EXISTS type VARCHAR(50),
ADD COLUMN IF NOT EXISTS order_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add confirmation_email_status to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS confirmation_email_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(type);
CREATE INDEX IF NOT EXISTS idx_email_events_order_id ON email_events(order_id);
CREATE INDEX IF NOT EXISTS idx_emails_type ON emails(type);
CREATE INDEX IF NOT EXISTS idx_emails_order_id ON emails(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_status ON orders(confirmation_email_status);

-- Update existing webhook_test entries to have proper type
UPDATE email_events 
SET type = 'webhook_test' 
WHERE type IS NULL AND event_type LIKE '%test%';

UPDATE emails 
SET type = 'webhook_test' 
WHERE type IS NULL AND subject LIKE '%test%';

-- Verify the changes
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('emails', 'email_events', 'orders')
    AND column_name IN ('type', 'order_id', 'error_message', 'confirmation_email_status', 'confirmation_email_sent_at')
ORDER BY table_name, column_name;
