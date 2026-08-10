BEGIN;

ALTER TABLE outbound_daily_delivery_counters
  DROP COLUMN IF EXISTS manual_sent_count,
  DROP COLUMN IF EXISTS manual_attempted_count;

DROP TABLE IF EXISTS outbound_manual_lead_reviews;

COMMIT;
