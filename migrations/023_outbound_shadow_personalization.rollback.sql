-- Roll back Phase 3 Shadow Mode personalization.
-- Run this rollback before Phase 2 or Phase 1 rollbacks.
-- No CASCADE is used; unexpected dependencies stop the rollback safely.

BEGIN;

DROP INDEX IF EXISTS outbound_ai_usage_prospect_idx;
DROP INDEX IF EXISTS outbound_messages_shadow_generation_idx;
DROP INDEX IF EXISTS outbound_messages_generation_key_uidx;
DROP INDEX IF EXISTS outbound_prospects_personalization_queue_idx;

ALTER TABLE outbound_ai_usage
  DROP COLUMN IF EXISTS usage_metadata,
  DROP COLUMN IF EXISTS error_code,
  DROP COLUMN IF EXISTS latency_ms,
  DROP COLUMN IF EXISTS prompt_version,
  DROP COLUMN IF EXISTS research_content_hash,
  DROP COLUMN IF EXISTS purpose;

ALTER TABLE outbound_messages
  DROP COLUMN IF EXISTS generated_at,
  DROP COLUMN IF EXISTS generation_metadata,
  DROP COLUMN IF EXISTS generation_error_code,
  DROP COLUMN IF EXISTS evidence_validation_status,
  DROP COLUMN IF EXISTS content_hash,
  DROP COLUMN IF EXISTS actual_openai_cost_microusd,
  DROP COLUMN IF EXISTS output_tokens,
  DROP COLUMN IF EXISTS cached_input_tokens,
  DROP COLUMN IF EXISTS input_tokens,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS research_content_hash,
  DROP COLUMN IF EXISTS output_schema_version,
  DROP COLUMN IF EXISTS prompt_version,
  DROP COLUMN IF EXISTS generation_key,
  DROP COLUMN IF EXISTS generation_status;

ALTER TABLE outbound_prospects
  DROP COLUMN IF EXISTS last_personalized_at,
  DROP COLUMN IF EXISTS personalization_failure_code,
  DROP COLUMN IF EXISTS personalization_content_hash,
  DROP COLUMN IF EXISTS personalization_state;

ALTER TABLE outbound_settings
  DROP COLUMN IF EXISTS shadow_generation_enabled;

COMMIT;
