-- Create cart_sessions table for anonymous and authenticated users
CREATE TABLE IF NOT EXISTS cart_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT, -- Supabase auth user ID (null for anonymous)
  device_id TEXT NOT NULL, -- Anonymous device identifier
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id)
);

-- Create cart_items table
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
  
  -- Banner specifications
  width_in DECIMAL(10, 2) NOT NULL,
  height_in DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  material TEXT NOT NULL,
  grommets TEXT NOT NULL DEFAULT 'none',
  pole_pockets TEXT DEFAULT 'none',
  pole_pocket_size TEXT DEFAULT '2',
  pole_pocket_position TEXT DEFAULT 'none',
  rope_feet DECIMAL(10, 2) DEFAULT 0,
  area_sqft DECIMAL(10, 2) NOT NULL,
  
  -- Pricing (in cents)
  unit_price_cents INTEGER NOT NULL,
  rope_cost_cents INTEGER DEFAULT 0,
  rope_pricing_mode TEXT DEFAULT 'per_item',
  pole_pocket_cost_cents INTEGER DEFAULT 0,
  pole_pocket_pricing_mode TEXT DEFAULT 'per_item',
  line_total_cents INTEGER NOT NULL,
  
  -- File information
  file_key TEXT,
  file_name TEXT,
  file_url TEXT,
  web_preview_url TEXT,
  print_ready_url TEXT,
  is_pdf BOOLEAN DEFAULT FALSE,
  
  -- Design elements (stored as JSONB)
  text_elements JSONB DEFAULT '[]'::jsonb,
  overlay_image JSONB,
  
  -- AI metadata (if applicable)
  ai_design JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cart_sessions_user_id ON cart_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_device_id ON cart_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_session_id ON cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_created_at ON cart_items(created_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to auto-update updated_at
CREATE TRIGGER update_cart_sessions_updated_at
  BEFORE UPDATE ON cart_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE cart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cart_sessions
-- Allow users to read their own sessions (by user_id or device_id)
CREATE POLICY "Users can read own cart sessions"
  ON cart_sessions FOR SELECT
  USING (
    user_id = auth.uid()::text 
    OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
  );

-- Allow users to insert their own sessions
CREATE POLICY "Users can insert own cart sessions"
  ON cart_sessions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text 
    OR user_id IS NULL
  );

-- Allow users to update their own sessions
CREATE POLICY "Users can update own cart sessions"
  ON cart_sessions FOR UPDATE
  USING (
    user_id = auth.uid()::text 
    OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
  );

-- RLS Policies for cart_items
-- Allow users to read items from their sessions
CREATE POLICY "Users can read own cart items"
  ON cart_items FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM cart_sessions 
      WHERE user_id = auth.uid()::text 
      OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  );

-- Allow users to insert items to their sessions
CREATE POLICY "Users can insert own cart items"
  ON cart_items FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM cart_sessions 
      WHERE user_id = auth.uid()::text 
      OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  );

-- Allow users to update their own cart items
CREATE POLICY "Users can update own cart items"
  ON cart_items FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM cart_sessions 
      WHERE user_id = auth.uid()::text 
      OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  );

-- Allow users to delete their own cart items
CREATE POLICY "Users can delete own cart items"
  ON cart_items FOR DELETE
  USING (
    session_id IN (
      SELECT id FROM cart_sessions 
      WHERE user_id = auth.uid()::text 
      OR device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  );

-- Function to merge anonymous cart into authenticated user's cart
CREATE OR REPLACE FUNCTION merge_anonymous_cart_to_user(
  p_device_id TEXT,
  p_user_id TEXT
)
RETURNS void AS $$
DECLARE
  v_anonymous_session_id UUID;
  v_user_session_id UUID;
BEGIN
  -- Get anonymous session
  SELECT id INTO v_anonymous_session_id
  FROM cart_sessions
  WHERE device_id = p_device_id AND user_id IS NULL;
  
  -- Get or create user session
  SELECT id INTO v_user_session_id
  FROM cart_sessions
  WHERE user_id = p_user_id;
  
  IF v_user_session_id IS NULL THEN
    INSERT INTO cart_sessions (user_id, device_id)
    VALUES (p_user_id, p_device_id)
    RETURNING id INTO v_user_session_id;
  END IF;
  
  -- Move items from anonymous session to user session
  IF v_anonymous_session_id IS NOT NULL THEN
    UPDATE cart_items
    SET session_id = v_user_session_id
    WHERE session_id = v_anonymous_session_id;
    
    -- Delete anonymous session
    DELETE FROM cart_sessions WHERE id = v_anonymous_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old anonymous sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_anonymous_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM cart_sessions
  WHERE user_id IS NULL
  AND updated_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
