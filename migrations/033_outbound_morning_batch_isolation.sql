-- Isolate generic/Apollo preparation from event-specific preparation.
-- Multiple logical batches may share a business date, but never a batch key.

BEGIN;

ALTER TABLE outbound_morning_batches
  ADD COLUMN IF NOT EXISTS batch_key VARCHAR(100);

WITH inferred AS (
  SELECT batch.id,batch.source_provider_id,batch.run_metadata,
         COALESCE(
           NULLIF(batch.run_metadata->>'eventKey',''),
           CASE WHEN COUNT(DISTINCT prospect.provider_metadata->>'eventKey')
                       FILTER (WHERE NULLIF(prospect.provider_metadata->>'eventKey','') IS NOT NULL)=1
             THEN MIN(prospect.provider_metadata->>'eventKey')
                       FILTER (WHERE NULLIF(prospect.provider_metadata->>'eventKey','') IS NOT NULL)
           END
         ) AS event_key
    FROM outbound_morning_batches batch
    LEFT JOIN outbound_prospects prospect ON prospect.morning_batch_id=batch.id
   GROUP BY batch.id,batch.source_provider_id,batch.run_metadata
)
UPDATE outbound_morning_batches batch
   SET batch_key=CASE
     WHEN inferred.source_provider_id='manual_event_research'
       AND COALESCE(inferred.event_key,'') ~ '^[a-z0-9][a-z0-9-]{4,79}$'
       THEN 'event:' || inferred.event_key
     WHEN inferred.source_provider_id='manual_event_research'
       THEN 'legacy:event:' || batch.id::text
     ELSE 'generic'
   END
  FROM inferred
 WHERE batch.id=inferred.id AND (batch.batch_key IS NULL OR batch.batch_key='');

ALTER TABLE outbound_morning_batches
  ALTER COLUMN batch_key SET DEFAULT 'generic',
  ALTER COLUMN batch_key SET NOT NULL;

ALTER TABLE outbound_morning_batches
  DROP CONSTRAINT IF EXISTS outbound_morning_batches_business_date_key;

ALTER TABLE outbound_morning_batches
  ADD CONSTRAINT outbound_morning_batches_business_date_batch_key_key
  UNIQUE (business_date,batch_key);

CREATE INDEX IF NOT EXISTS outbound_morning_batches_key_status_date_idx
  ON outbound_morning_batches (batch_key,status,business_date DESC);

COMMENT ON COLUMN outbound_morning_batches.batch_key IS
  'Fail-closed logical queue identity: generic or event:<validated event key>.';

COMMIT;
