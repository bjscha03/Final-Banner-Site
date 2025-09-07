-- Add order_number column to orders table
-- This will be a unique 6-7 digit number for customer-facing order references

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20) UNIQUE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- Add contact_messages table for contact form system
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for contact messages
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_messages_email ON contact_messages(email);

-- Update existing orders with order numbers (backfill)
-- Generate 6-digit order numbers starting from 100000
UPDATE orders 
SET order_number = LPAD((100000 + ROW_NUMBER() OVER (ORDER BY created_at))::text, 6, '0')
WHERE order_number IS NULL;
