-- Additive; legacy requests retain their original 25% offer.
-- The authenticated manual-send endpoint also installs this schema on demand.
BEGIN;
ALTER TABLE review_request_history
  ADD COLUMN IF NOT EXISTS email_kind TEXT NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS offer_percentage INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS email_payload JSONB,
  ADD COLUMN IF NOT EXISTS provider_started_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS review_coupon_rewards (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL REFERENCES discount_codes(code),
  customer_email TEXT NOT NULL,
  offer_percentage INTEGER NOT NULL CHECK (offer_percentage IN (25, 30)),
  review_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
COMMIT;
