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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_ai_images_user_id ON saved_ai_images(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_ai_images_created_at ON saved_ai_images(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_saved_ai_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saved_ai_images_updated_at
  BEFORE UPDATE ON saved_ai_images
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_ai_images_updated_at();
