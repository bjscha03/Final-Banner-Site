-- AI Generation System Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User credits table
CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credits INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generations table (cached AI images)
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  aspect TEXT NOT NULL,
  size TEXT NOT NULL,
  style JSONB DEFAULT '{}',
  tier TEXT NOT NULL CHECK (tier IN ('premium', 'standard')),
  image_urls JSONB NOT NULL,
  cost_usd DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Selections table (final upscaled images)
CREATE TABLE IF NOT EXISTS selections (
  id TEXT PRIMARY KEY,
  gen_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  selected_url TEXT NOT NULL,
  banner_w_in DECIMAL(10, 2),
  banner_h_in DECIMAL(10, 2),
  final_cloudinary_public_id TEXT,
  final_pdf_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage log table (analytics and monitoring)
CREATE TABLE IF NOT EXISTS usage_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_generations_prompt_hash ON generations(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_generations_cache_lookup ON generations(prompt_hash, aspect, size);
CREATE INDEX IF NOT EXISTS idx_selections_user_id ON selections(user_id);
CREATE INDEX IF NOT EXISTS idx_selections_gen_id ON selections(gen_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_user_id ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_event ON usage_log(event);
CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_monthly_cost ON usage_log(created_at, event) WHERE event = 'GEN_SUCCESS';
