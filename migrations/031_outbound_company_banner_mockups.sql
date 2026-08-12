BEGIN;

CREATE TABLE IF NOT EXISTS outbound_company_mockups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'fallback', 'failed')),
  scene_id TEXT NOT NULL DEFAULT 'storefront'
    CHECK (scene_id IN ('trade_show', 'storefront', 'community_event')),
  render_version TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  blob_key TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg'
    CHECK (mime_type IN ('image/jpeg')),
  width INTEGER NOT NULL DEFAULT 1200 CHECK (width = 1200),
  height INTEGER NOT NULL DEFAULT 675 CHECK (height = 675),
  logo_url TEXT,
  product_image_url TEXT,
  event_label TEXT,
  quality_level TEXT NOT NULL DEFAULT 'name_only'
    CHECK (quality_level IN ('logo_and_product', 'logo', 'product', 'name_only')),
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error_code VARCHAR(100),
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_company_mockups_status_updated_idx
  ON outbound_company_mockups (status, updated_at DESC);

COMMENT ON TABLE outbound_company_mockups IS
  'Deterministic company-branded banner mockup metadata. Raster bytes live in Netlify Blobs, not Postgres.';
COMMENT ON COLUMN outbound_company_mockups.quality_level IS
  'Records whether exact public logo and/or product imagery was composited. name_only is the non-blocking fallback.';

COMMIT;
