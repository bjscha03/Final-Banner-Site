BEGIN;

DROP INDEX IF EXISTS outbound_morning_batches_key_status_date_idx;

ALTER TABLE outbound_morning_batches
  ADD CONSTRAINT outbound_morning_batches_business_date_key UNIQUE (business_date);

ALTER TABLE outbound_morning_batches
  DROP CONSTRAINT outbound_morning_batches_business_date_batch_key_key,
  DROP COLUMN batch_key;

COMMIT;
