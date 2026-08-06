-- Phase 4: isolated inbound-reply intelligence and review workflow.
-- Additive and outbound-only. No sender, legacy table reference, or scheduler.

BEGIN;

ALTER TABLE outbound_settings
  ADD COLUMN IF NOT EXISTS reply_ingestion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reply_ai_fallback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suggested_reply_generation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE outbound_replies
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to_provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS deterministic_rule_version TEXT NOT NULL DEFAULT 'reply-rules-v1',
  ADD COLUMN IF NOT EXISTS classification_reason JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS headers_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS suggested_response_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (suggested_response_status IN ('not_requested', 'deterministic', 'generated', 'failed', 'blocked')),
  ADD COLUMN IF NOT EXISTS suggested_response_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS handled_by TEXT,
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS outbound_replies_provider_message_uidx
  ON outbound_replies (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_replies_classification_idx
  ON outbound_replies (classification, review_status, received_at DESC);

CREATE INDEX IF NOT EXISTS outbound_replies_sender_idx
  ON outbound_replies (LOWER(from_email), received_at DESC);

ALTER TABLE outbound_ai_usage
  ADD COLUMN IF NOT EXISTS reply_id UUID REFERENCES outbound_replies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS outbound_ai_usage_reply_idx
  ON outbound_ai_usage (reply_id, created_at DESC)
  WHERE reply_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS outbound_inbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL DEFAULT 'resend',
  event_kind TEXT NOT NULL CHECK (event_kind IN ('delivery', 'reply', 'unsubscribe')),
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'duplicate', 'failed', 'blocked')),
  related_message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  related_reply_id UUID REFERENCES outbound_replies(id) ON DELETE SET NULL,
  error_code TEXT,
  diagnostic_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_inbound_events_status_idx
  ON outbound_inbound_events (processing_status, received_at DESC);

COMMIT;
