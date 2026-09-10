-- Safe migration to add file_key column to order_items table
-- This migration is idempotent and safe to run multiple times

-- Add file_key column if it doesn't exist
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS file_key VARCHAR(255);

-- Add index for better performance on file_key lookups
CREATE INDEX IF NOT EXISTS idx_order_items_file_key ON order_items(file_key);

-- Verify the column was added
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
    AND column_name = 'file_key';

-- Show current order_items schema
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'order_items' 
ORDER BY ordinal_position;

-- Success message
SELECT 'file_key column migration completed successfully!' as message;
