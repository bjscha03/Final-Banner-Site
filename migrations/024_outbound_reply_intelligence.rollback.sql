-- Safe Phase 4 rollback. Removes only outbound objects introduced by 024.
BEGIN;

DROP INDEX IF EXISTS outbound_inbound_events_status_idx;
DROP TABLE IF EXISTS outbound_inbound_events;
DROP INDEX IF EXISTS outbound_ai_usage_reply_idx;
ALTER TABLE outbound_ai_usage DROP COLUMN IF EXISTS reply_id;
DROP INDEX IF EXISTS outbound_replies_sender_idx;
DROP INDEX IF EXISTS outbound_replies_classification_idx;
DROP INDEX IF EXISTS outbound_replies_provider_message_uidx;
ALTER TABLE outbound_replies
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS handled_at,
  DROP COLUMN IF EXISTS handled_by,
  DROP COLUMN IF EXISTS suggested_response_review_required,
  DROP COLUMN IF EXISTS suggested_response_status,
  DROP COLUMN IF EXISTS headers_summary,
  DROP COLUMN IF EXISTS classification_reason,
  DROP COLUMN IF EXISTS deterministic_rule_version,
  DROP COLUMN IF EXISTS raw_content_hash,
  DROP COLUMN IF EXISTS in_reply_to_provider_message_id,
  DROP COLUMN IF EXISTS provider_message_id;
ALTER TABLE outbound_settings
  DROP COLUMN IF EXISTS suggested_reply_generation_enabled,
  DROP COLUMN IF EXISTS reply_ai_fallback_enabled,
  DROP COLUMN IF EXISTS reply_ingestion_enabled;

COMMIT;
