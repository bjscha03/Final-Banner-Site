-- Enhanced User Carts Migration
-- Adds session_id, status, and last_accessed_at columns for robust cart synchronization


-- Drop the old unique constraint on user_id
-- This allows users to have multiple carts with different statuses (active, archived, merged)
ALTER TABLE user_carts 
DROP CONSTRAINT IF EXISTS user_carts_user_id_key;
-- Add session_id column for guest cart tracking
ALTER TABLE user_carts 
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);

-- Add status column for cart lifecycle management
ALTER TABLE user_carts 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Add last_accessed_at column for cleanup
ALTER TABLE user_carts 
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP DEFAULT NOW();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_carts_session_id ON user_carts(session_id);
CREATE INDEX IF NOT EXISTS idx_user_carts_status ON user_carts(status);
CREATE INDEX IF NOT EXISTS idx_user_carts_user_status ON user_carts(user_id, status);

-- Create unique partial index for one active cart per user
-- This ensures each user can only have one active cart
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_carts_unique_active_user 
ON user_carts(user_id) 
WHERE status = 'active' AND user_id IS NOT NULL;

-- Create unique partial index for one active cart per session
-- This ensures each guest session can only have one active cart
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_carts_unique_active_session 
ON user_carts(session_id) 
WHERE status = 'active' AND session_id IS NOT NULL;

-- Update the trigger to maintain both updated_at and last_accessed_at
DROP TRIGGER IF EXISTS update_user_carts_updated_at ON user_carts;

CREATE OR REPLACE FUNCTION update_user_carts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_accessed_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_carts_updated_at
    BEFORE UPDATE ON user_carts
    FOR EACH ROW
    EXECUTE FUNCTION update_user_carts_timestamp();

-- Create cleanup function for abandoned carts
-- This can be called periodically to clean up old abandoned carts
CREATE OR REPLACE FUNCTION cleanup_abandoned_carts(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_carts
    WHERE status = 'abandoned'
    AND last_accessed_at < NOW() - (days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN user_carts.session_id IS 'Session ID for guest carts (before authentication)';
COMMENT ON COLUMN user_carts.status IS 'Cart lifecycle status: active, merged, abandoned';
COMMENT ON COLUMN user_carts.last_accessed_at IS 'Last time cart was accessed (for cleanup)';
COMMENT ON FUNCTION cleanup_abandoned_carts IS 'Cleanup abandoned carts older than specified days (default 90)';

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'user_carts'
ORDER BY ordinal_position;
