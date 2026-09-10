-- Add 'in_production' status to orders table check constraint
-- and add production email tracking columns
-- This migration is idempotent and safe to run multiple times

-- Drop the existing check constraint (if it exists)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new check constraint that includes 'in_production'
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'shipped', 'in_production'));

-- Add production email tracking columns
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS production_email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS production_email_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for performance on production email queries
CREATE INDEX IF NOT EXISTS idx_orders_production_email_sent 
  ON orders(production_email_sent);

-- Verify the columns were added
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
    AND column_name IN ('production_email_sent', 'production_email_sent_at')
ORDER BY column_name;
