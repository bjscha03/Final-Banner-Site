-- Phase 2: licensed discovery and deterministic qualification in Shadow Mode.
--
-- This migration is additive and outbound-only. It does not reference, alter,
-- backfill, or attach triggers to any storefront, checkout, order, payment,
-- customer, AI Designer, upload, preview, analytics, or transactional-email
-- object. Runtime code may read legacy orders to suppress existing customers,
-- but this migration deliberately creates no cross-subsystem dependency.

BEGIN;

ALTER TABLE outbound_prospects
  ADD COLUMN IF NOT EXISTS research_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (research_state IN ('pending', 'fetched', 'unchanged', 'blocked', 'failed')),
  ADD COLUMN IF NOT EXISTS contact_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (contact_state IN ('pending', 'found', 'role_only', 'none', 'invalid', 'dns_unknown')),
  ADD COLUMN IF NOT EXISTS qualification_version TEXT NOT NULL DEFAULT 'deterministic-v1',
  ADD COLUMN IF NOT EXISTS exclusion_codes JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS last_qualified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outbound_prospects_shadow_queue_idx
  ON outbound_prospects (status, lead_score DESC NULLS LAST, last_qualified_at DESC NULLS LAST, discovered_at DESC);

ALTER TABLE outbound_contacts
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS syntax_valid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_role_address BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_free_mailbox BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS domain_matches BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS mx_status TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (mx_status IN ('not_checked', 'present', 'null_mx', 'missing', 'temporary_error')),
  ADD COLUMN IF NOT EXISTS mx_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_eligible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS outbound_contacts_prospect_quality_idx
  ON outbound_contacts (prospect_id, active DESC, send_eligible DESC, contact_quality_score DESC NULLS LAST);

ALTER TABLE outbound_research_snapshots
  ADD COLUMN IF NOT EXISTS final_url TEXT,
  ADD COLUMN IF NOT EXISTS http_status SMALLINT CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS content_bytes INTEGER NOT NULL DEFAULT 0 CHECK (content_bytes >= 0),
  ADD COLUMN IF NOT EXISTS http_etag TEXT,
  ADD COLUMN IF NOT EXISTS http_last_modified TEXT,
  ADD COLUMN IF NOT EXISTS extraction_version TEXT NOT NULL DEFAULT 'deterministic-html-v1',
  ADD COLUMN IF NOT EXISTS cache_status TEXT NOT NULL DEFAULT 'fresh'
    CHECK (cache_status IN ('fresh', 'reused', 'invalidated')),
  ADD COLUMN IF NOT EXISTS page_manifest JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE IF NOT EXISTS outbound_prospect_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  provider_record_id TEXT NOT NULL,
  source_url TEXT,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, provider_record_id)
);

CREATE INDEX IF NOT EXISTS outbound_prospect_sources_prospect_idx
  ON outbound_prospect_sources (prospect_id, last_seen_at DESC);

ALTER TABLE outbound_provider_usage
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_credits NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (provider_credits >= 0),
  ADD COLUMN IF NOT EXISTS rate_limit_remaining INTEGER CHECK (rate_limit_remaining IS NULL OR rate_limit_remaining >= 0),
  ADD COLUMN IF NOT EXISTS rate_limit_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usage_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_provider_usage_request_uidx
  ON outbound_provider_usage (request_key)
  WHERE request_key IS NOT NULL;

INSERT INTO outbound_provider_configs (
  provider_id,
  provider_kind,
  display_name,
  enabled,
  non_secret_config,
  daily_request_limit,
  monthly_budget_cents
)
VALUES (
  'apollo',
  'discovery',
  'Apollo Organization Search',
  FALSE,
  jsonb_build_object(
    'mode', 'shadow',
    'endpoint', 'organization_search',
    'estimated_cost_microusd_per_credit', 19600,
    'maximum_results_per_request', 30
  ),
  0,
  0
)
ON CONFLICT (provider_id) DO NOTHING;

COMMIT;
