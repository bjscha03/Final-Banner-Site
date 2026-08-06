-- Safe Phase 5 rollback. Removes only outbound objects introduced by 025.
BEGIN;

DROP INDEX IF EXISTS outbound_circuit_breaker_events_key_idx;
DROP TABLE IF EXISTS outbound_circuit_breaker_events;
DROP TABLE IF EXISTS outbound_daily_delivery_counters;
DROP INDEX IF EXISTS outbound_unsubscribe_tokens_active_idx;
DROP TABLE IF EXISTS outbound_unsubscribe_tokens;
ALTER TABLE outbound_suppressions
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS evidence,
  DROP COLUMN IF EXISTS message_id,
  DROP COLUMN IF EXISTS contact_id,
  DROP COLUMN IF EXISTS prospect_id;
DROP INDEX IF EXISTS outbound_messages_delivery_queue_idx;
ALTER TABLE outbound_messages
  DROP COLUMN IF EXISTS delivery_metadata,
  DROP COLUMN IF EXISTS last_send_latency_ms,
  DROP COLUMN IF EXISTS last_send_error_code,
  DROP COLUMN IF EXISTS next_send_attempt_at,
  DROP COLUMN IF EXISTS send_attempt_count,
  DROP COLUMN IF EXISTS planned_send_at,
  DROP COLUMN IF EXISTS delivery_state;
DROP INDEX IF EXISTS outbound_campaigns_campaign_key_uidx;
ALTER TABLE outbound_campaigns
  DROP COLUMN IF EXISTS performance_summary,
  DROP COLUMN IF EXISTS last_evaluated_at,
  DROP COLUMN IF EXISTS safety_state,
  DROP COLUMN IF EXISTS minimum_decision_sample,
  DROP COLUMN IF EXISTS objective,
  DROP COLUMN IF EXISTS campaign_key;
ALTER TABLE outbound_settings
  DROP COLUMN IF EXISTS maximum_error_rate,
  DROP COLUMN IF EXISTS maximum_complaint_rate,
  DROP COLUMN IF EXISTS maximum_bounce_rate,
  DROP COLUMN IF EXISTS minimum_spacing_seconds,
  DROP COLUMN IF EXISTS sending_window_end_local,
  DROP COLUMN IF EXISTS sending_window_start_local,
  DROP COLUMN IF EXISTS delivery_webhook_enabled,
  DROP COLUMN IF EXISTS automation_enabled;

COMMIT;
