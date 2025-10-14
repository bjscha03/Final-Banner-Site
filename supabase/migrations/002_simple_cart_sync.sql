-- Simple cart sync for logged-in users only
-- This is a much simpler version than the full anonymous sync

CREATE TABLE IF NOT EXISTS user_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  cart_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_carts_user_id ON user_carts(user_id);

-- Auto-update timestamp
CREATE TRIGGER update_user_carts_updated_at
  BEFORE UPDATE ON user_carts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE user_carts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own cart
CREATE POLICY "Users can read own cart"
  ON user_carts FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own cart"
  ON user_carts FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own cart"
  ON user_carts FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own cart"
  ON user_carts FOR DELETE
  USING (user_id = auth.uid()::text);
