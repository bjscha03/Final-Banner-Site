-- Monotonic browser snapshot ordering. A nullable/no-default revision lets
-- rolling older writers continue updating historical unversioned rows, but
-- once a new writer records a revision they can no longer overwrite it.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-schema-v3')::bigint);

ALTER TABLE abandoned_carts
  ADD COLUMN IF NOT EXISTS snapshot_revision BIGINT;

-- Repair partial/pre-created variants too: older rolling writers must be able
-- to omit the revision while unversioned rows are still in circulation.
ALTER TABLE abandoned_carts
  ALTER COLUMN snapshot_revision DROP NOT NULL,
  ALTER COLUMN snapshot_revision DROP DEFAULT;

COMMIT;
