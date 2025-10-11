-- AI Credits Purchase System
-- This migration adds support for purchasing AI generation credits

-- Credit purchases table
CREATE TABLE IF NOT EXISTS credit_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  credits_purchased INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  payment_method TEXT DEFAULT 'paypal',
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  status TEXT DEFAULT 'pending', -- pending, completed, failed, refunded
  customer_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for credit purchases
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_email ON credit_purchases(email);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_status ON credit_purchases(status);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_created_at ON credit_purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_paypal_order ON credit_purchases(paypal_order_id);

-- Add comment for documentation
COMMENT ON TABLE credit_purchases IS 'Tracks all AI credit purchases made by users';
COMMENT ON COLUMN credit_purchases.credits_purchased IS 'Number of AI generation credits purchased';
COMMENT ON COLUMN credit_purchases.amount_cents IS 'Amount paid in cents (USD)';
COMMENT ON COLUMN credit_purchases.status IS 'Payment status: pending, completed, failed, refunded';
