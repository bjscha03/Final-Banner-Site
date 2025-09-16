-- Add uploaded_files table for tracking customer uploaded files
-- This is optional but helps with file management and cleanup

CREATE TABLE IF NOT EXISTS uploaded_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_key VARCHAR(255) UNIQUE NOT NULL,
    original_filename VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    file_content_base64 TEXT, -- Store file content as base64 for development
    upload_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'uploaded',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_uploaded_files_file_key ON uploaded_files(file_key);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_status ON uploaded_files(status);

-- Add some sample data for testing
INSERT INTO uploaded_files (file_key, original_filename, file_size, mime_type, status) VALUES
('uploads/1234567890-company-logo.png', 'company-logo.png', 245760, 'image/png', 'uploaded'),
('uploads/1234567891-banner-design.pdf', 'banner-design.pdf', 1048576, 'application/pdf', 'uploaded'),
('uploads/1234567892-artwork.jpg', 'artwork.jpg', 512000, 'image/jpeg', 'uploaded')
ON CONFLICT (file_key) DO NOTHING;
