-- Migration: Add OAuth columns to profiles table
-- Date: 2025-10-13
-- Purpose: Add google_id and linkedin_id columns for OAuth authentication

-- Add google_id column for Google OAuth
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Add linkedin_id column for LinkedIn OAuth (for future use)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS linkedin_id VARCHAR(255) UNIQUE;

-- Add password_hash column for email/password authentication
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create indexes for faster OAuth lookups
CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id);
CREATE INDEX IF NOT EXISTS idx_profiles_linkedin_id ON profiles(linkedin_id);

-- Add comments for documentation
COMMENT ON COLUMN profiles.google_id IS 'Google OAuth user ID (sub claim from Google)';
COMMENT ON COLUMN profiles.linkedin_id IS 'LinkedIn OAuth user ID';
COMMENT ON COLUMN profiles.password_hash IS 'Bcrypt hashed password for email/password authentication';

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('google_id', 'linkedin_id', 'password_hash')
ORDER BY column_name;
