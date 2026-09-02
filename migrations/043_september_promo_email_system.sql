-- Durable, idempotent manual marketing-email delivery and global marketing
-- suppression for the September 2026 BIG25 promotion.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS marketing_email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN (
    'unsubscribe', 'spam_complaint', 'hard_bounce', 'provider_suppressed', 'admin'
  )),
  source TEXT NOT NULL CHECK (source IN (
    'footer_link', 'list_unsubscribe', 'resend_webhook', 'admin'
  )),
  campaign_key TEXT,
  first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (normalized_email = LOWER(normalized_email)),
  CHECK (normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE INDEX IF NOT EXISTS marketing_email_suppressions_active_idx
  ON marketing_email_suppressions (normalized_email)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS marketing_email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  sending_admin_id TEXT,
  sending_admin_email TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'processing', 'sent', 'error', 'unsubscribed', 'complained', 'bounced', 'suppressed'
  )),
  request_id TEXT NOT NULL,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  resend_message_id TEXT,
  unsubscribe_token_hash TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_message TEXT,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  UNIQUE (campaign_key, normalized_email),
  CHECK (normalized_email = LOWER(normalized_email)),
  CHECK (normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE INDEX IF NOT EXISTS marketing_email_sends_campaign_status_idx
  ON marketing_email_sends (campaign_key, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketing_email_sends_recipient_idx
  ON marketing_email_sends (normalized_email, created_at DESC);

COMMIT;
