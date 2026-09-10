-- Add Design Service columns to order_items table
-- Run this migration on your Neon database

-- Design Service flag
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_service_enabled BOOLEAN DEFAULT FALSE;

-- Customer's design description/request
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_request_text TEXT;

-- Draft delivery preference: 'email' or 'text'
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_draft_preference VARCHAR(10);

-- Contact info for draft delivery (email address or phone number)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_draft_contact VARCHAR(255);

-- Uploaded assets from customer (stored as JSONB array)
-- Each asset: { name, type, size, url, fileKey }
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_uploaded_assets JSONB DEFAULT '[]'::jsonb;

-- Final Print PDF (uploaded by design team after completing the design)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_print_pdf_url TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_print_pdf_file_key TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE;

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'order_items'
AND column_name IN (
  'design_service_enabled',
  'design_request_text', 
  'design_draft_preference',
  'design_draft_contact',
  'design_uploaded_assets',
  'final_print_pdf_url',
  'final_print_pdf_file_key',
  'final_print_pdf_uploaded_at'
)
ORDER BY column_name;

