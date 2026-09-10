-- Fix: Add unique partial indexes for ON CONFLICT clauses

-- For user_id conflicts
CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_user_active 
ON abandoned_carts(user_id) 
WHERE recovery_status = 'active' AND user_id IS NOT NULL;

-- For session_id conflicts
CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_session_active 
ON abandoned_carts(session_id) 
WHERE recovery_status = 'active' AND session_id IS NOT NULL;

-- Verify indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'abandoned_carts' 
  AND indexname LIKE '%_active';
