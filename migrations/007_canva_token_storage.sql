-- ============================================================================
-- CANVA TOKEN STORAGE - SECURE OAUTH TOKEN MANAGEMENT
-- Migration 007
-- Created: 2025-10-25
-- ============================================================================
-- 
-- This migration creates a secure storage system for Canva OAuth tokens
-- to comply with Canva's security requirements:
-- 
-- 1. Tokens stored in database (not passed in URLs)
-- 2. Refresh tokens stored for long-term access
-- 3. Token revocation tracking
-- 4. Automatic cleanup of disconnected tokens after 30 days
-- 
-- ============================================================================

-- Create canva_tokens table
CREATE TABLE IF NOT EXISTS canva_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  canva_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  
  -- Ensure one token per user
  UNIQUE(user_id)
);

-- Add foreign key constraint if auth.users table exists
-- (Supabase/Neon may have different auth table structure)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE canva_tokens 
    ADD CONSTRAINT fk_canva_tokens_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_canva_tokens_user_id 
ON canva_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_canva_tokens_expires_at 
ON canva_tokens(expires_at) 
WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canva_tokens_disconnected 
ON canva_tokens(disconnected_at) 
WHERE disconnected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canva_tokens_cleanup 
ON canva_tokens(disconnected_at) 
WHERE disconnected_at IS NOT NULL 
AND disconnected_at < NOW() - INTERVAL '30 days';

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_canva_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_canva_tokens_updated_at
  BEFORE UPDATE ON canva_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_canva_tokens_updated_at();

-- Add comments for documentation
COMMENT ON TABLE canva_tokens IS 'Secure storage for Canva OAuth tokens - complies with Canva security requirements';
COMMENT ON COLUMN canva_tokens.user_id IS 'User who authorized the Canva integration';
COMMENT ON COLUMN canva_tokens.access_token IS 'Canva OAuth access token (encrypted at rest by database)';
COMMENT ON COLUMN canva_tokens.refresh_token IS 'Canva OAuth refresh token for long-term access';
COMMENT ON COLUMN canva_tokens.expires_at IS 'When the access token expires (typically 1 hour)';
COMMENT ON COLUMN canva_tokens.disconnected_at IS 'When user disconnected/revoked Canva access - tokens deleted after 30 days';
COMMENT ON COLUMN canva_tokens.last_used_at IS 'Last time this token was used for API calls';

-- Create function to mark token as disconnected (soft delete)
CREATE OR REPLACE FUNCTION disconnect_canva_token(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE canva_tokens
  SET disconnected_at = NOW()
  WHERE user_id = p_user_id
  AND disconnected_at IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION disconnect_canva_token IS 'Mark a Canva token as disconnected - will be deleted after 30 days';

-- Create function to cleanup old disconnected tokens
CREATE OR REPLACE FUNCTION cleanup_disconnected_canva_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete tokens that have been disconnected for more than 30 days
  DELETE FROM canva_tokens
  WHERE disconnected_at IS NOT NULL
  AND disconnected_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_disconnected_canva_tokens IS 'Delete Canva tokens that have been disconnected for more than 30 days - run daily';

-- Create function to get active token for user
CREATE OR REPLACE FUNCTION get_active_canva_token(p_user_id UUID)
RETURNS TABLE (
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.access_token,
    ct.refresh_token,
    ct.expires_at,
    ct.expires_at < NOW() as is_expired
  FROM canva_tokens ct
  WHERE ct.user_id = p_user_id
  AND ct.disconnected_at IS NULL
  LIMIT 1;
  
  -- Update last_used_at
  UPDATE canva_tokens
  SET last_used_at = NOW()
  WHERE user_id = p_user_id
  AND disconnected_at IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_canva_token IS 'Get active Canva token for user and update last_used_at timestamp';

-- Verify the table was created
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'canva_tokens'
ORDER BY ordinal_position;

-- Show summary
SELECT 
  'canva_tokens table created successfully' as status,
  COUNT(*) as existing_tokens
FROM canva_tokens;
