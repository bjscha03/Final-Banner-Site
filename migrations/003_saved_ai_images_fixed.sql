-- Migration: Saved AI Images
-- Allows users to save AI-generated images for later use

CREATE TABLE IF NOT EXISTS saved_ai_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT,
  aspect TEXT,
  tier TEXT DEFAULT 'premium',
  generation_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
