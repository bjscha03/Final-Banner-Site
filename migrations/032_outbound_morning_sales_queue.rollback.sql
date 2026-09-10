BEGIN;

DROP INDEX IF EXISTS outbound_prospects_morning_queue_idx;
DROP INDEX IF EXISTS outbound_morning_batch_shards_status_idx;

ALTER TABLE outbound_prospects
  DROP COLUMN IF EXISTS morning_ready_at,
  DROP COLUMN IF EXISTS morning_queue_position,
  DROP COLUMN IF EXISTS imported_business_date,
  DROP COLUMN IF EXISTS morning_batch_id;

DROP TABLE IF EXISTS outbound_morning_batch_shards;
DROP TABLE IF EXISTS outbound_morning_batches;

COMMIT;
