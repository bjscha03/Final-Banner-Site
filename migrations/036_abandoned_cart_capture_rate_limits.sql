-- Durable abuse controls for the public abandoned-cart snapshot endpoint.
-- Identifiers are one-way HMAC/SHA-256 digests; raw IP and recipient values
-- must never be stored in this table.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('abandoned-cart-capture-rate-limit-v1')::bigint);

CREATE TABLE IF NOT EXISTS abandoned_cart_capture_rate_limits (
  scope TEXT NOT NULL CHECK (scope IN ('session', 'ip', 'recipient')),
  subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  actor_hash TEXT NOT NULL CHECK (actor_hash ~ '^[a-f0-9]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count > 0),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, subject_hash, actor_hash)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_capture_limits_window
  ON abandoned_cart_capture_rate_limits(scope, subject_hash, window_started_at);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_capture_limits_last_seen
  ON abandoned_cart_capture_rate_limits(last_seen_at);

COMMIT;
