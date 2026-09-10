-- Events System v2 Database Migration
-- Creates event_categories and events tables with indexes and triggers

-- Create event_categories table
CREATE TABLE IF NOT EXISTS event_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed event categories
INSERT INTO event_categories (name, slug, description) VALUES
  ('Food Trucks', 'food-trucks', 'Food truck events, rallies, and gatherings'),
  ('Festivals', 'festivals', 'Music festivals, art festivals, and community celebrations'),
  ('Trade Shows', 'trade-shows', 'Industry trade shows, expos, and conventions'),
  ('Schools', 'schools', 'School events, fundraisers, and sports'),
  ('Sports', 'sports', 'Sporting events, tournaments, and competitions'),
  ('Real Estate', 'real-estate', 'Open houses, real estate events'),
  ('Breweries', 'breweries', 'Brewery events, tastings, and festivals'),
  ('Conferences', 'conferences', 'Professional conferences and seminars'),
  ('Farmers Markets', 'farmers-markets', 'Farmers markets and agricultural events'),
  ('Community', 'community', 'Community events and gatherings'),
  ('Holidays/Seasonal', 'holidays-seasonal', 'Holiday and seasonal events'),
  ('Other', 'other', 'Other events')
ON CONFLICT (slug) DO NOTHING;

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  category_id INTEGER REFERENCES event_categories(id) ON DELETE SET NULL,
  summary_short TEXT,
  description TEXT,
  external_url VARCHAR(500),
  image_url VARCHAR(500),
  venue VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP,
  recommended_material VARCHAR(50),
  popular_sizes TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by VARCHAR(255),
  created_ip VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_category_start ON events(category_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_location ON events(city, state);
CREATE INDEX IF NOT EXISTS idx_events_featured ON events(is_featured, start_at DESC) WHERE is_featured = TRUE;

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT ON event_categories TO PUBLIC;
-- GRANT SELECT ON events TO PUBLIC;
