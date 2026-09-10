-- Database Schema Updates for Production Email System
-- Execute these statements in your Neon database console

-- 1. Create password_resets table for secure password reset flow
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Foreign key constraint (adjust table name if different)
  CONSTRAINT fk_password_resets_user_id 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at);

-- 2. Add order email tracking fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmation_email_status text,
  ADD COLUMN IF NOT EXISTS confirmation_emailed_at timestamptz;

-- Create index for email status queries
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_email_status 
  ON orders(confirmation_email_status);

-- 3. Ensure email_events table exists with proper structure
CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  to_email text NOT NULL,
  provider_msg_id text,
  status text NOT NULL,
  error_message text,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for email_events
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(type);
CREATE INDEX IF NOT EXISTS idx_email_events_status ON email_events(status);
CREATE INDEX IF NOT EXISTS idx_email_events_order_id ON email_events(order_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_provider_msg_id ON email_events(provider_msg_id);

-- 4. Add password_hash column to profiles table if it doesn't exist
-- (This assumes you're using database-based authentication)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash text;

-- 5. Clean up any existing password reset tokens that are expired
-- (Run this periodically or set up a cron job)
DELETE FROM password_resets 
WHERE expires_at < NOW() AND used = false;

-- 6. Update any existing orders to have default email status
UPDATE orders 
SET confirmation_email_status = 'unknown'
WHERE confirmation_email_status IS NULL;

-- 7. Verify the schema updates
SELECT 
  'password_resets' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_entry
FROM password_resets
UNION ALL
SELECT 
  'email_events' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_entry
FROM email_events
UNION ALL
SELECT 
  'orders' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_entry
FROM orders;

-- 8. Show current email event statistics
SELECT 
  type,
  status,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM email_events
GROUP BY type, status
ORDER BY type, status;

-- 9. Show orders with email tracking status
SELECT 
  confirmation_email_status,
  COUNT(*) as count
FROM orders
GROUP BY confirmation_email_status
ORDER BY count DESC;

-- Success message
SELECT 'Database schema updates completed successfully!' as message;
