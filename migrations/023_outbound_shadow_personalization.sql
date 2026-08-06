-- Phase 3: OpenAI-assisted personalization previews in Shadow Mode.
--
-- This migration is additive and outbound-only. It does not reference, alter,
-- backfill, or attach triggers to any storefront, checkout, order, payment,
-- customer, AI Banner Designer, upload, preview, analytics, or transactional-
-- email object. Runtime code must never execute this DDL.

BEGIN;

ALTER TABLE outbound_settings
  ADD COLUMN IF NOT EXISTS shadow_generation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE outbound_prospects
  ADD COLUMN IF NOT EXISTS personalization_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (personalization_state IN ('pending', 'generating', 'generated', 'stale', 'blocked', 'failed')),
  ADD COLUMN IF NOT EXISTS personalization_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS personalization_failure_code TEXT,
  ADD COLUMN IF NOT EXISTS last_personalized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outbound_prospects_personalization_queue_idx
  ON outbound_prospects (
    personalization_state,
    status,
    lead_score DESC NULLS LAST,
    last_qualified_at DESC NULLS LAST
  );

ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'not_generated'
    CHECK (generation_status IN ('not_generated', 'generating', 'generated', 'blocked', 'failed', 'stale')),
  ADD COLUMN IF NOT EXISTS generation_key TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS output_schema_version TEXT,
  ADD COLUMN IF NOT EXISTS research_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS actual_openai_cost_microusd BIGINT CHECK (
    actual_openai_cost_microusd IS NULL OR actual_openai_cost_microusd >= 0
  ),
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS evidence_validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (evidence_validation_status IN ('pending', 'passed', 'failed')),
  ADD COLUMN IF NOT EXISTS generation_error_code TEXT,
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_generation_key_uidx
  ON outbound_messages (generation_key)
  WHERE generation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_messages_shadow_generation_idx
  ON outbound_messages (generation_status, generated_at DESC NULLS LAST, created_at DESC);

ALTER TABLE outbound_ai_usage
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'personalized_outreach'
    CHECK (purpose IN ('personalized_outreach', 'reply_classification', 'suggested_reply')),
  ADD COLUMN IF NOT EXISTS research_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS usage_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS outbound_ai_usage_prospect_idx
  ON outbound_ai_usage (prospect_id, created_at DESC);

COMMIT;
