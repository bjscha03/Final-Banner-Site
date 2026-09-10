-- Drop the old unique constraint on user_id
-- This allows users to have multiple carts with different statuses (active, archived, merged)
ALTER TABLE user_carts 
DROP CONSTRAINT IF EXISTS user_carts_user_id_key;

-- Verify it's gone
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'user_carts'::regclass
AND conname = 'user_carts_user_id_key';
