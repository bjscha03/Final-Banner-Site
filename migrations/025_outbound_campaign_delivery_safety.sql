-- Phase 5: campaign experiments, dry-run scheduling, and delivery safety.
-- All execution controls default off. Additive and outbound-only.

BEGIN;

ALTER TABLE outbound_settings
  ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sending_window_start_local TIME NOT NULL DEFAULT '09:30',
  ADD COLUMN IF NOT EXISTS sending_window_end_local TIME NOT NULL DEFAULT '16:30',
  ADD COLUMN IF NOT EXISTS minimum_spacing_seconds INTEGER NOT NULL DEFAULT 600
    CHECK (minimum_spacing_seconds BETWEEN 60 AND 86400),
  ADD COLUMN IF NOT EXISTS maximum_bounce_rate NUMERIC(6,5) NOT NULL DEFAULT 0.05000
    CHECK (maximum_bounce_rate BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS maximum_complaint_rate NUMERIC(6,5) NOT NULL DEFAULT 0.00100
    CHECK (maximum_complaint_rate BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS maximum_error_rate NUMERIC(6,5) NOT NULL DEFAULT 0.10000
    CHECK (maximum_error_rate BETWEEN 0 AND 1);

ALTER TABLE outbound_campaigns
  ADD COLUMN IF NOT EXISTS campaign_key TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT NOT NULL DEFAULT 'revenue'
    CHECK (objective IN ('qualified_replies', 'quote_requests', 'paid_orders', 'revenue')),
  ADD COLUMN IF NOT EXISTS minimum_decision_sample INTEGER NOT NULL DEFAULT 60
    CHECK (minimum_decision_sample >= 30),
  ADD COLUMN IF NOT EXISTS safety_state TEXT NOT NULL DEFAULT 'shadow'
    CHECK (safety_state IN ('shadow', 'healthy', 'paused', 'blocked')),
  ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS performance_summary JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_campaigns_campaign_key_uidx
  ON outbound_campaigns (campaign_key)
  WHERE campaign_key IS NOT NULL;

ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS delivery_state TEXT NOT NULL DEFAULT 'not_planned'
    CHECK (delivery_state IN ('not_planned', 'shadow_planned', 'ready', 'sending', 'sent', 'blocked', 'failed', 'canceled')),
  ADD COLUMN IF NOT EXISTS planned_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (send_attempt_count BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS next_send_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_send_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_send_latency_ms INTEGER CHECK (last_send_latency_ms IS NULL OR last_send_latency_ms >= 0),
  ADD COLUMN IF NOT EXISTS delivery_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS outbound_messages_delivery_queue_idx
  ON outbound_messages (delivery_state, planned_send_at, created_at)
  WHERE delivery_state IN ('shadow_planned', 'ready', 'failed');

ALTER TABLE outbound_suppressions
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES outbound_prospects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES outbound_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS outbound_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  contact_id UUID NOT NULL REFERENCES outbound_contacts(id) ON DELETE RESTRICT,
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_unsubscribe_tokens_active_idx
  ON outbound_unsubscribe_tokens (expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS outbound_daily_delivery_counters (
  business_date DATE PRIMARY KEY,
  planned_count INTEGER NOT NULL DEFAULT 0 CHECK (planned_count >= 0),
  attempted_count INTEGER NOT NULL DEFAULT 0 CHECK (attempted_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  delivered_count INTEGER NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  bounced_count INTEGER NOT NULL DEFAULT 0 CHECK (bounced_count >= 0),
  complained_count INTEGER NOT NULL DEFAULT 0 CHECK (complained_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  unsubscribed_count INTEGER NOT NULL DEFAULT 0 CHECK (unsubscribed_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  breaker_key TEXT NOT NULL,
  previous_state TEXT NOT NULL CHECK (previous_state IN ('closed', 'open', 'half_open')),
  new_state TEXT NOT NULL CHECK (new_state IN ('closed', 'open', 'half_open')),
  reason_code TEXT NOT NULL,
  observed_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  opened_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_circuit_breaker_events_key_idx
  ON outbound_circuit_breaker_events (breaker_key, created_at DESC);

COMMIT;
