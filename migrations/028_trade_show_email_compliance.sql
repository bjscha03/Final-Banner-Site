-- Trade-show promotional email unsubscribe and provider-event compliance.
-- Additive and repeatable. Existing send/activity data is preserved.

BEGIN;

ALTER TABLE trade_show_email_activity
  ADD COLUMN IF NOT EXISTS unsubscribe_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;

ALTER TABLE trade_show_email_activity
  DROP CONSTRAINT IF EXISTS trade_show_email_activity_status_check;

ALTER TABLE trade_show_email_activity
  ADD CONSTRAINT trade_show_email_activity_status_check
  CHECK (status IN ('processing', 'sent', 'error', 'unsubscribed', 'complained', 'bounced', 'suppressed'));

CREATE UNIQUE INDEX IF NOT EXISTS trade_show_email_activity_unsubscribe_token_uidx
  ON trade_show_email_activity (unsubscribe_token_hash)
  WHERE unsubscribe_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS trade_show_email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN (
    'unsubscribe', 'spam_complaint', 'hard_bounce', 'provider_suppressed', 'admin'
  )),
  source TEXT NOT NULL CHECK (source IN (
    'footer_link', 'list_unsubscribe', 'resend_webhook', 'admin'
  )),
  trade_show_slug TEXT REFERENCES trade_show_promo_codes(trade_show_slug) ON DELETE SET NULL,
  activity_id UUID REFERENCES trade_show_email_activity(id) ON DELETE SET NULL,
  resend_message_id TEXT,
  provider_event_id TEXT,
  first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (normalized_email = LOWER(normalized_email)),
  CHECK (normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE INDEX IF NOT EXISTS trade_show_email_unsubscribes_updated_idx
  ON trade_show_email_unsubscribes (updated_at DESC);

CREATE TABLE IF NOT EXISTS trade_show_email_provider_events (
  provider_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'email.complained', 'email.bounced', 'email.suppressed'
  )),
  resend_message_id TEXT,
  recipient_email TEXT,
  activity_id UUID REFERENCES trade_show_email_activity(id) ON DELETE SET NULL,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN (
    'received', 'processed', 'ignored', 'error'
  )),
  alert_status TEXT NOT NULL DEFAULT 'not_required' CHECK (alert_status IN (
    'not_required', 'sent', 'error', 'not_configured'
  )),
  alert_resend_message_id TEXT,
  error_message TEXT,
  event_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS trade_show_email_provider_events_activity_idx
  ON trade_show_email_provider_events (activity_id, event_at DESC);

COMMIT;
