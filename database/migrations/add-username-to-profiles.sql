-- Migration: Add username field to profiles table
-- Date: 2025-01-06
-- Purpose: Add unique username field for better user identification

-- Add username column to profiles table
ALTER TABLE profiles 
ADD COLUMN username VARCHAR(50) UNIQUE;

-- Create index for faster username lookups
CREATE INDEX idx_profiles_username ON profiles(username);

-- Add constraint to ensure username is not empty when provided
ALTER TABLE profiles 
ADD CONSTRAINT chk_username_not_empty 
CHECK (username IS NULL OR LENGTH(TRIM(username)) > 0);

-- Optional: Add constraint for username format (alphanumeric + underscore/dash)
ALTER TABLE profiles 
ADD CONSTRAINT chk_username_format 
CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_-]+$');

-- Update existing users to have a default username based on email
-- This is optional - you can skip this if you want usernames to be NULL for existing users
-- UPDATE profiles 
-- SET username = LOWER(SPLIT_PART(email, '@', 1))
-- WHERE username IS NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;
