-- Email System Database Migration for Neon Database
-- Run this in your Neon database console to set up comprehensive email tracking

-- Create email_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                    -- 'user.verify', 'order.confirmation', etc.
  to_email TEXT NOT NULL,
  provider_msg_id TEXT,                  -- Resend message ID for webhook correlation
  status TEXT NOT NULL,                  -- 'sent' | 'delivered' | 'opened' | 'bounced' | 'complained' | 'error'
  error_message TEXT,
  order_id TEXT,                         -- Associated order ID (for order emails)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create password_resets table for password reset flow
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add email status columns to orders table if they don't exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS confirmation_email_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS email_events_order_id_idx ON email_events(order_id);
CREATE INDEX IF NOT EXISTS email_events_created_at_idx ON email_events(created_at DESC);
CREATE INDEX IF NOT EXISTS email_events_type_idx ON email_events(type);
CREATE INDEX IF NOT EXISTS email_events_status_idx ON email_events(status);
CREATE INDEX IF NOT EXISTS email_events_provider_msg_id_idx ON email_events(provider_msg_id);

CREATE INDEX IF NOT EXISTS password_resets_email_idx ON password_resets(email);
CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets(token);
CREATE INDEX IF NOT EXISTS password_resets_expires_at_idx ON password_resets(expires_at);

CREATE INDEX IF NOT EXISTS orders_confirmation_email_status_idx ON orders(confirmation_email_status);

-- Clean up expired password reset tokens (run periodically)
-- DELETE FROM password_resets WHERE expires_at < NOW() - INTERVAL '1 day';

-- Verify the migration
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('email_events', 'password_resets', 'orders')
    AND column_name IN ('type', 'to_email', 'provider_msg_id', 'status', 'error_message', 'order_id', 
                        'email', 'token', 'expires_at', 'used_at',
                        'confirmation_email_status', 'confirmation_email_sent_at')
ORDER BY table_name, column_name;

-- Sample queries for monitoring
-- Recent email activity (last 24 hours)
-- SELECT created_at, type, to_email, status, error_message
-- FROM email_events
-- WHERE created_at > NOW() - INTERVAL '24 hours'
-- ORDER BY created_at DESC;

-- Failed emails requiring attention
-- SELECT * FROM email_events 
-- WHERE status = 'error' AND created_at > NOW() - INTERVAL '7 days'
-- ORDER BY created_at DESC;

-- Order confirmation email status
-- SELECT o.id, o.email, o.confirmation_email_status, o.confirmation_email_sent_at,
--        ee.status as latest_email_status, ee.created_at as email_sent_at
-- FROM orders o
-- LEFT JOIN email_events ee ON ee.order_id = o.id AND ee.type = 'order.confirmation'
-- WHERE o.created_at > NOW() - INTERVAL '7 days'
-- ORDER BY o.created_at DESC;
