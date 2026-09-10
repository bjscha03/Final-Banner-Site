-- Add text_elements column to order_items table
-- This migration adds support for storing text layers added by users in the design tool

-- Add column for text elements (stored as JSONB for flexibility)
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS text_elements JSONB DEFAULT '[]'::jsonb;

-- Add index for better query performance on text elements
CREATE INDEX IF NOT EXISTS idx_order_items_text_elements ON order_items USING GIN (text_elements);

-- Add comment to document the column
COMMENT ON COLUMN order_items.text_elements IS 'Array of text layer objects with content, position, font, size, color, etc.';
