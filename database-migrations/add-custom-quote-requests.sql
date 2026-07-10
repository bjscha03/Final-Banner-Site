-- Custom quote requests for banners, yard signs, and magnets
CREATE TABLE IF NOT EXISTS custom_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(20) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'New',
  full_name VARCHAR(160) NOT NULL,
  company_name VARCHAR(160),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  product_type VARCHAR(40) NOT NULL,
  width NUMERIC(10,2) NOT NULL,
  height NUMERIC(10,2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  material_specs TEXT,
  finishing_options TEXT,
  needed_by_date DATE,
  shipping_zip VARCHAR(20) NOT NULL,
  project_description TEXT NOT NULL,
  additional_notes TEXT,
  product_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  artwork_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS custom_quote_request_number_seq START WITH 1;
CREATE INDEX IF NOT EXISTS idx_custom_quote_requests_status ON custom_quote_requests(status);
CREATE INDEX IF NOT EXISTS idx_custom_quote_requests_created_at ON custom_quote_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_quote_requests_email ON custom_quote_requests(email);
