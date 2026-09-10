-- Daily, manually-sent morning sales queue metadata.
--
-- This migration never schedules or sends email. It records licensed/first-party
-- lead-import batches so the admin can prove what was ready before the workday.

BEGIN;

CREATE TABLE IF NOT EXISTS outbound_morning_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE NOT NULL UNIQUE,
  target_count SMALLINT NOT NULL DEFAULT 70 CHECK (target_count BETWEEN 1 AND 70),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'discovering', 'preparing', 'ready', 'partial', 'failed')),
  source_provider_id TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  new_prospect_count INTEGER NOT NULL DEFAULT 0 CHECK (new_prospect_count >= 0),
  qualified_count INTEGER NOT NULL DEFAULT 0 CHECK (qualified_count >= 0),
  message_ready_count INTEGER NOT NULL DEFAULT 0 CHECK (message_ready_count >= 0),
  mockup_ready_count INTEGER NOT NULL DEFAULT 0 CHECK (mockup_ready_count >= 0),
  provider_request_count INTEGER NOT NULL DEFAULT 0 CHECK (provider_request_count >= 0),
  provider_credits_reserved INTEGER NOT NULL DEFAULT 0 CHECK (provider_credits_reserved >= 0),
  provider_credits_used INTEGER NOT NULL DEFAULT 0 CHECK (provider_credits_used >= 0),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  last_error_code VARCHAR(100),
  run_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_morning_batch_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES outbound_morning_batches(id) ON DELETE CASCADE,
  shard_key VARCHAR(80) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  provider_request_key TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  new_prospect_count INTEGER NOT NULL DEFAULT 0 CHECK (new_prospect_count >= 0),
  provider_credits_used INTEGER NOT NULL DEFAULT 0 CHECK (provider_credits_used >= 0),
  last_error_code VARCHAR(100),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, shard_key)
);

ALTER TABLE outbound_prospects
  ADD COLUMN IF NOT EXISTS morning_batch_id UUID REFERENCES outbound_morning_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_business_date DATE,
  ADD COLUMN IF NOT EXISTS morning_queue_position SMALLINT CHECK (morning_queue_position IS NULL OR morning_queue_position BETWEEN 1 AND 70),
  ADD COLUMN IF NOT EXISTS morning_ready_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outbound_prospects_morning_queue_idx
  ON outbound_prospects (imported_business_date DESC, morning_queue_position, lead_score DESC NULLS LAST)
  WHERE morning_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_morning_batches_status_date_idx
  ON outbound_morning_batches (status, business_date DESC);

CREATE INDEX IF NOT EXISTS outbound_morning_batch_shards_status_idx
  ON outbound_morning_batch_shards (batch_id, status, updated_at);

COMMENT ON TABLE outbound_morning_batches IS
  'Auditable daily preparation status for the manual-only 70-lead morning sales queue.';

COMMIT;
