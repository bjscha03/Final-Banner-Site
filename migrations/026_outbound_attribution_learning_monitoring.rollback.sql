-- Safe Phase 6 rollback. Removes only outbound objects introduced by 026.
BEGIN;

DROP INDEX IF EXISTS outbound_operational_alerts_open_idx;
DROP TABLE IF EXISTS outbound_operational_alerts;
DROP INDEX IF EXISTS outbound_learning_recommendations_status_idx;
DROP TABLE IF EXISTS outbound_learning_recommendations;
DROP INDEX IF EXISTS outbound_performance_daily_dimension_idx;
DROP TABLE IF EXISTS outbound_performance_daily;
DROP INDEX IF EXISTS outbound_attribution_candidates_review_idx;
DROP TABLE IF EXISTS outbound_attribution_candidates;
ALTER TABLE outbound_settings
  DROP COLUMN IF EXISTS exploration_percent,
  DROP COLUMN IF EXISTS minimum_learning_sample,
  DROP COLUMN IF EXISTS monitoring_enabled,
  DROP COLUMN IF EXISTS learning_enabled,
  DROP COLUMN IF EXISTS attribution_enabled;

COMMIT;
