-- Durable singleton lease for the background abandoned-cart recovery worker.
-- Neon HTTP calls do not preserve database sessions, so a session advisory
-- lock cannot safely cover the worker's external email calls.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-schema-v3')::bigint);

CREATE TABLE IF NOT EXISTS recovery_job_leases (
  job_name TEXT PRIMARY KEY,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (NULLIF(BTRIM(lease_owner), '') IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

COMMIT;
