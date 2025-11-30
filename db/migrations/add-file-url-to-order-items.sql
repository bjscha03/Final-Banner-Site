-- Add file_url column to order_items table for storing full Cloudinary URLs
-- This is needed for PDF uploads where we need the full URL, not just file_key
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Add comment  
COMMENT ON COLUMN order_items.file_url IS 'Full Cloudinary URL for uploaded files (especially PDFs)';
