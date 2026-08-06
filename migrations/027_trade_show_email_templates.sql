-- Admin trade-show email templates and reusable event promotion codes.
-- Additive and repeatable: existing event codes are never overwritten.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trade_show_promo_codes (
  trade_show_slug TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  discount_percentage SMALLINT NOT NULL DEFAULT 20 CHECK (discount_percentage = 20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (trade_show_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CHECK (code = UPPER(code)),
  CHECK (code ~ '^[A-Z0-9-]{4,24}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_show_promo_codes_upper_code_unique
  ON trade_show_promo_codes (UPPER(code));

CREATE TABLE IF NOT EXISTS trade_show_email_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_show_slug TEXT NOT NULL REFERENCES trade_show_promo_codes(trade_show_slug),
  trade_show_name TEXT NOT NULL,
  exhibitor_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  discount_code TEXT NOT NULL,
  sending_admin_id TEXT,
  sending_admin_email TEXT,
  resend_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'sent', 'error')),
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS trade_show_email_activity_event_created_idx
  ON trade_show_email_activity (trade_show_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS trade_show_email_activity_recipient_idx
  ON trade_show_email_activity (LOWER(recipient_email), created_at DESC);

-- Fail safely if a proposed event code already belongs to the legacy coupon
-- table. This prevents a migration from silently shadowing legitimate data.
DO $$
DECLARE
  conflicting_code TEXT;
BEGIN
  WITH proposed(code) AS (
    VALUES
      ('20APMA'), ('20APA'), ('20ADCES'), ('20ASA'), ('20EVOLVE'), ('20LAS'),
      ('20WWIN'), ('20OFFPRICE'), ('20MAGIC'), ('20HOMELAND'), ('20ENERGY'),
      ('20NURSERY'), ('20CHEMEDGE'), ('20OBAP'), ('20WR'), ('20ENERGYMA'),
      ('20WATER'), ('20FIRE'), ('20SUPERZOO'), ('20RE'), ('20MEN'), ('20ATLANTA'),
      ('20ASAE'), ('20WVC'), ('20NACHC'), ('20AHE'), ('20IMAGE'), ('20NPPA'),
      ('20MEALS'), ('20MAXIMOWO'), ('20WESA'), ('20NEWTOPIA'), ('20DAKOTAFE'),
      ('20ISE'), ('20FUTURE'), ('20OUTDOOR'), ('20LANDSCAP'), ('20IVT'),
      ('20ANIME'), ('20DENTAL'), ('20COFFEE'), ('20DEMO'), ('20CR'), ('20ACS'),
      ('20NIGP'), ('20ED'), ('20ICES'), ('20ILTACON'), ('20SPIE'), ('20TECHCON'),
      ('20CONNECT'), ('20IWF'), ('20RMAS'), ('20SPE'), ('20SUMMIT'), ('20ASD'),
      ('20STORMCON'), ('20MEDEVICE'), ('20NM'), ('20FARWEST'), ('20NGAUS'),
      ('20FETCH'), ('20AMERICAN'), ('20LUCKY'), ('20CANNACON'), ('20IECSC'),
      ('20PWX'), ('20AWWA'), ('20PVA'), ('20SAFETY'), ('20HR'), ('20TRENDZ'),
      ('20PREMIERE'), ('20NORTH'), ('20IDN')
  )
  SELECT p.code INTO conflicting_code
  FROM proposed p
  JOIN discount_codes d ON UPPER(d.code) = p.code
  LIMIT 1;

  IF conflicting_code IS NOT NULL THEN
    RAISE EXCEPTION 'Trade-show code % already exists in discount_codes; review before applying migration 027', conflicting_code;
  END IF;
END $$;

INSERT INTO trade_show_promo_codes (trade_show_slug, code, discount_percentage)
VALUES
  ('apma-the-national', '20APMA', 20),
  ('apa-convention', '20APA', 20),
  ('adces-annual-meeting', '20ADCES', 20),
  ('asa-annual-meeting', '20ASA', 20),
  ('evolve-show', '20EVOLVE', 20),
  ('las-vegas-apparel-august', '20LAS', 20),
  ('wwin', '20WWIN', 20),
  ('offprice-las-vegas', '20OFFPRICE', 20),
  ('magic-las-vegas', '20MAGIC', 20),
  ('national-homeland-security-conference', '20HOMELAND', 20),
  ('energy-innovations-rockies-west', '20ENERGY', 20),
  ('nursery-landscape-expo', '20NURSERY', 20),
  ('chemedge', '20CHEMEDGE', 20),
  ('obap-conference', '20OBAP', 20),
  ('wr-expo', '20WR', 20),
  ('the-energy-expo', '20ENERGYMA', 20),
  ('the-water-expo', '20WATER', 20),
  ('fire-rescue-international', '20FIRE', 20),
  ('superzoo', '20SUPERZOO', 20),
  ('re-plus-mid-atlantic', '20RE', 20),
  ('current-concepts-mens-health', '20MEN', 20),
  ('atlanta-shoe-market', '20ATLANTA', 20),
  ('asae-annual-meeting', '20ASAE', 20),
  ('wvc-nashville', '20WVC', 20),
  ('nachc-community-health-institute', '20NACHC', 20),
  ('ahe-exchange', '20AHE', 20),
  ('image-2026', '20IMAGE', 20),
  ('nppa-conference', '20NPPA', 20),
  ('meals-on-wheels-conference', '20MEALS', 20),
  ('maximo-world', '20MAXIMOWO', 20),
  ('wesa-trade-show', '20WESA', 20),
  ('newtopia-now', '20NEWTOPIA', 20),
  ('dakotafest', '20DAKOTAFE', 20),
  ('ise-expo', '20ISE', 20),
  ('future-biotech-expo', '20FUTURE', 20),
  ('outdoor-retailer', '20OUTDOOR', 20),
  ('the-landscape-show', '20LANDSCAP', 20),
  ('ivt-expo', '20IVT', 20),
  ('anime-nyc', '20ANIME', 20),
  ('southwest-dental-conference', '20DENTAL', 20),
  ('coffee-fest-los-angeles', '20COFFEE', 20),
  ('demo-days-festival', '20DEMO', 20),
  ('california-restaurant-show', '20CR', 20),
  ('acs-fall', '20ACS', 20),
  ('nigp-forum', '20NIGP', 20),
  ('ed-expo', '20ED', 20),
  ('international-congress-esthetics-spa', '20ICES', 20),
  ('iltacon', '20ILTACON', 20),
  ('spie-optics-photonics', '20SPIE', 20),
  ('techcon-365', '20TECHCON', 20),
  ('connect-summer-marketplace', '20CONNECT', 20),
  ('iwf-atlanta', '20IWF', 20),
  ('rocky-mountain-apparel-show', '20RMAS', 20),
  ('spe-artificial-lift-conference', '20SPE', 20),
  ('broadband-communities-summit', '20SUMMIT', 20),
  ('asd-market-week', '20ASD', 20),
  ('stormcon', '20STORMCON', 20),
  ('meddevice-boston', '20MEDEVICE', 20),
  ('northeast-materials-show', '20NM', 20),
  ('farwest-show', '20FARWEST', 20),
  ('ngaus-general-conference', '20NGAUS', 20),
  ('fetch-kansas-city', '20FETCH', 20),
  ('american-legion-national-convention', '20AMERICAN', 20),
  ('lucky-leaf-expo-richmond', '20LUCKY', 20),
  ('cannacon-st-louis', '20CANNACON', 20),
  ('iecsc-florida', '20IECSC', 20),
  ('pwx-2026', '20PWX', 20),
  ('awwa-water-infrastructure-conference', '20AWWA', 20),
  ('pva-healthcare-summit', '20PVA', 20),
  ('vpppa-safety-symposium', '20SAFETY', 20),
  ('hr-florida-conference', '20HR', 20),
  ('trendz-apparel-show', '20TRENDZ', 20),
  ('premiere-san-antonio', '20PREMIERE', 20),
  ('north-east-toy-show', '20NORTH', 20),
  ('idn-summit-reverse-expo', '20IDN', 20)
ON CONFLICT (trade_show_slug) DO NOTHING;
