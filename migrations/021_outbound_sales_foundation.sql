-- Phase 1: isolated foundation for the Banners on the Fly outbound sales engine.
--
-- This migration is intentionally additive. It does not alter, backfill, or
-- reference any existing checkout, order, payment, customer, AI Designer, or
-- transactional-email table. Runtime functions must never execute this DDL.

BEGIN;

CREATE TABLE IF NOT EXISTS outbound_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shadow_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  live_sending_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_paused BOOLEAN NOT NULL DEFAULT FALSE,
  daily_send_limit SMALLINT NOT NULL DEFAULT 30 CHECK (daily_send_limit BETWEEN 0 AND 30),
  monthly_openai_budget_cents INTEGER NOT NULL DEFAULT 800 CHECK (monthly_openai_budget_cents BETWEEN 0 AND 100000),
  openai_project_limit_recommendation_cents INTEGER NOT NULL DEFAULT 1000 CHECK (openai_project_limit_recommendation_cents >= 0),
  monthly_provider_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_provider_budget_cents >= 0),
  business_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  settings_version BIGINT NOT NULL DEFAULT 1 CHECK (settings_version > 0),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT (shadow_mode_enabled AND live_sending_enabled))
);

INSERT INTO outbound_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS outbound_provider_configs (
  provider_id TEXT PRIMARY KEY CHECK (provider_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('discovery', 'email_verification')),
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  non_secret_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  daily_request_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_request_limit >= 0),
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0),
  settings_version BIGINT NOT NULL DEFAULT 1 CHECK (settings_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shadow', 'active', 'paused', 'completed', 'archived')),
  targeting_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  experiment_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_provider_id TEXT NOT NULL CHECK (source_provider_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_record_id TEXT,
  source_url TEXT,
  business_name TEXT NOT NULL,
  normalized_business_name TEXT NOT NULL,
  dedupe_fingerprint TEXT,
  website_url TEXT,
  canonical_domain TEXT,
  phone TEXT,
  industry TEXT,
  business_type TEXT,
  location_count INTEGER CHECK (location_count IS NULL OR location_count >= 0),
  address JSONB NOT NULL DEFAULT '{}'::JSONB,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN (
    'discovered',
    'qualified',
    'rejected',
    'ready_for_outreach',
    'contacted',
    'replied',
    'interested',
    'quote_requested',
    'quote_sent',
    'won',
    'lost',
    'unsubscribed',
    'suppressed'
  )),
  lead_score SMALLINT CHECK (lead_score IS NULL OR lead_score BETWEEN 0 AND 100),
  score_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
  score_explanation JSONB NOT NULL DEFAULT '[]'::JSONB,
  qualification_evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  rejection_reason TEXT,
  suppression_reason TEXT,
  prior_customer_match BOOLEAN NOT NULL DEFAULT FALSE,
  website_content_hash TEXT,
  first_contacted_at TIMESTAMPTZ,
  last_researched_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_prospects_provider_record_uidx
  ON outbound_prospects (source_provider_id, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_prospects_dedupe_fingerprint_uidx
  ON outbound_prospects (dedupe_fingerprint)
  WHERE dedupe_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_prospects_canonical_domain_uidx
  ON outbound_prospects (LOWER(canonical_domain))
  WHERE canonical_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_prospects_queue_idx
  ON outbound_prospects (status, lead_score DESC NULLS LAST, discovered_at);

CREATE TABLE IF NOT EXISTS outbound_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  full_name TEXT,
  job_title TEXT,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  contact_quality_score SMALLINT CHECK (contact_quality_score IS NULL OR contact_quality_score BETWEEN 0 AND 100),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN (
    'unverified', 'pending', 'valid', 'risky', 'accept_all', 'invalid', 'unknown'
  )),
  verification_provider_id TEXT,
  verification_reason TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_contacts_email_uidx
  ON outbound_contacts (LOWER(email_normalized));

CREATE UNIQUE INDEX IF NOT EXISTS outbound_contacts_one_primary_uidx
  ON outbound_contacts (prospect_id)
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS outbound_research_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  website_url TEXT,
  source_urls JSONB NOT NULL DEFAULT '[]'::JSONB,
  extracted_facts JSONB NOT NULL DEFAULT '{}'::JSONB,
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  banner_need_signals JSONB NOT NULL DEFAULT '[]'::JSONB,
  website_freshness_score SMALLINT CHECK (website_freshness_score IS NULL OR website_freshness_score BETWEEN 0 AND 100),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prospect_id, content_hash)
);

CREATE INDEX IF NOT EXISTS outbound_research_snapshots_latest_idx
  ON outbound_research_snapshots (prospect_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS outbound_campaign_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outbound_campaigns(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN (
    'subject_line_style',
    'call_to_action_style',
    'email_length',
    'offer_framing',
    'industry_positioning'
  )),
  variant_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  variant_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  allocation_weight NUMERIC(8, 5) NOT NULL DEFAULT 1 CHECK (allocation_weight >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'retired')),
  minimum_delivered_sample INTEGER NOT NULL DEFAULT 30 CHECK (minimum_delivered_sample >= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, dimension, variant_key)
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES outbound_contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES outbound_campaigns(id) ON DELETE SET NULL,
  message_kind TEXT NOT NULL DEFAULT 'initial' CHECK (message_kind IN ('initial', 'follow_up', 'suggested_reply')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'ready', 'blocked', 'scheduled', 'sending', 'sent', 'delivered',
    'bounced', 'complained', 'failed', 'canceled', 'suppressed'
  )),
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  research_summary TEXT,
  personalization_evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_urls JSONB NOT NULL DEFAULT '[]'::JSONB,
  variant_assignments JSONB NOT NULL DEFAULT '{}'::JSONB,
  recommended_follow_up_at TIMESTAMPTZ,
  send_key TEXT,
  resend_message_id TEXT,
  estimated_openai_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (estimated_openai_cost_microusd >= 0),
  estimated_provider_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (estimated_provider_cost_microusd >= 0),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_one_initial_per_prospect_uidx
  ON outbound_messages (prospect_id)
  WHERE message_kind = 'initial';

CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_send_key_uidx
  ON outbound_messages (send_key)
  WHERE send_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_resend_message_uidx
  ON outbound_messages (resend_message_id)
  WHERE resend_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_messages_activity_idx
  ON outbound_messages (status, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES outbound_contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES outbound_campaigns(id) ON DELETE SET NULL,
  originating_message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN (
    'discovered',
    'qualified',
    'rejected',
    'ready_for_outreach',
    'contacted',
    'replied',
    'interested',
    'quote_requested',
    'quote_sent',
    'won',
    'lost',
    'unsubscribed',
    'suppressed'
  )),
  estimated_value_cents INTEGER CHECK (estimated_value_cents IS NULL OR estimated_value_cents >= 0),
  quoted_value_cents INTEGER CHECK (quoted_value_cents IS NULL OR quoted_value_cents >= 0),
  won_revenue_cents INTEGER CHECK (won_revenue_cents IS NULL OR won_revenue_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  pipeline_evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  loss_reason TEXT,
  next_action_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_opportunities_pipeline_idx
  ON outbound_opportunities (status, next_action_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS outbound_opportunities_prospect_idx
  ON outbound_opportunities (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_order_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_order_id UUID NOT NULL UNIQUE,
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  opportunity_id UUID REFERENCES outbound_opportunities(id) ON DELETE SET NULL,
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES outbound_campaigns(id) ON DELETE SET NULL,
  attribution_method TEXT NOT NULL CHECK (attribution_method IN (
    'signed_link', 'reply_email', 'quote_request', 'email_match',
    'domain_match', 'promotion_code', 'manual'
  )),
  attribution_confidence NUMERIC(5, 4) CHECK (attribution_confidence IS NULL OR attribution_confidence BETWEEN 0 AND 1),
  gross_revenue_cents INTEGER NOT NULL CHECK (gross_revenue_cents >= 0),
  attributed_revenue_cents INTEGER NOT NULL CHECK (attributed_revenue_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  source_order_status TEXT,
  is_test_order BOOLEAN NOT NULL DEFAULT FALSE,
  attribution_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  ordered_at TIMESTAMPTZ,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_order_attributions_revenue_idx
  ON outbound_order_attributions (attributed_at DESC)
  WHERE is_test_order = FALSE;

CREATE INDEX IF NOT EXISTS outbound_order_attributions_prospect_idx
  ON outbound_order_attributions (prospect_id, attributed_at DESC);

CREATE TABLE IF NOT EXISTS outbound_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  provider_event_id TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT,
  subject TEXT,
  body_text TEXT,
  sanitized_body_html TEXT,
  classification TEXT NOT NULL DEFAULT 'unclear' CHECK (classification IN (
    'interested',
    'quote_request',
    'question',
    'not_now',
    'not_interested',
    'unsubscribe',
    'out_of_office',
    'wrong_contact',
    'automatic_reply',
    'unclear'
  )),
  classification_source TEXT NOT NULL DEFAULT 'deterministic' CHECK (classification_source IN ('deterministic', 'ai', 'admin')),
  classification_confidence NUMERIC(5, 4) CHECK (classification_confidence IS NULL OR classification_confidence BETWEEN 0 AND 1),
  suggested_response_subject TEXT,
  suggested_response_body TEXT,
  review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'reviewed', 'handled', 'ignored')),
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_replies_provider_event_uidx
  ON outbound_replies (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_replies_inbox_idx
  ON outbound_replies (review_status, received_at DESC);

CREATE TABLE IF NOT EXISTS outbound_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('email', 'email_domain', 'company_domain', 'provider_record')),
  normalized_value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'unsubscribed', 'hard_bounce', 'complaint', 'wrong_contact', 'prior_customer',
    'manual', 'legal', 'blocklist', 'duplicate'
  )),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'admin', 'provider', 'reply', 'webhook')),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, normalized_value)
);

CREATE INDEX IF NOT EXISTS outbound_suppressions_lookup_idx
  ON outbound_suppressions (scope, normalized_value)
  WHERE active;

CREATE TABLE IF NOT EXISTS outbound_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN (
    'discover', 'normalize', 'research', 'verify_email', 'qualify', 'generate',
    'schedule', 'send', 'process_email_event', 'classify_reply', 'attribute_order',
    'aggregate_metrics'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'retry', 'succeeded', 'dead', 'canceled')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT,
  priority SMALLINT NOT NULL DEFAULT 0,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  last_error_code TEXT,
  last_error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_jobs_dedupe_uidx
  ON outbound_jobs (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'retry');

CREATE INDEX IF NOT EXISTS outbound_jobs_claim_idx
  ON outbound_jobs (priority DESC, run_after, created_at)
  WHERE status IN ('queued', 'retry');

CREATE INDEX IF NOT EXISTS outbound_jobs_lease_idx
  ON outbound_jobs (lease_expires_at)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS outbound_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('openai', 'discovery', 'email_verification', 'resend')),
  provider_id TEXT,
  reservation_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
  estimated_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  actual_cost_microusd BIGINT CHECK (actual_cost_microusd IS NULL OR actual_cost_microusd >= 0),
  reference_type TEXT,
  reference_id UUID,
  usage_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_cost_ledger_monthly_idx
  ON outbound_cost_ledger (category, occurred_at)
  WHERE status IN ('reserved', 'committed');

CREATE TABLE IF NOT EXISTS outbound_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES outbound_prospects(id) ON DELETE SET NULL,
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  job_id UUID REFERENCES outbound_jobs(id) ON DELETE SET NULL,
  cost_ledger_id UUID REFERENCES outbound_cost_ledger(id) ON DELETE SET NULL,
  request_key TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  actual_cost_microusd BIGINT CHECK (actual_cost_microusd IS NULL OR actual_cost_microusd >= 0),
  provider_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_ai_usage_monthly_idx
  ON outbound_ai_usage (created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('discovery', 'email_verification')),
  operation TEXT NOT NULL,
  prospect_id UUID REFERENCES outbound_prospects(id) ON DELETE SET NULL,
  job_id UUID REFERENCES outbound_jobs(id) ON DELETE SET NULL,
  cost_ledger_id UUID REFERENCES outbound_cost_ledger(id) ON DELETE SET NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  estimated_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  actual_cost_microusd BIGINT CHECK (actual_cost_microusd IS NULL OR actual_cost_microusd >= 0),
  status TEXT NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_provider_usage_monthly_idx
  ON outbound_provider_usage (provider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  provider_event_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced',
    'complained', 'suppressed', 'failed', 'received'
  )),
  event_status TEXT,
  event_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  event_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_email_events_provider_event_uidx
  ON outbound_email_events (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_email_events_message_idx
  ON outbound_email_events (message_id, event_at DESC);

CREATE TABLE IF NOT EXISTS outbound_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'admin', 'provider', 'webhook', 'database_trigger')),
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  previous_values JSONB,
  new_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_audit_log_entity_idx
  ON outbound_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS outbound_audit_log_created_idx
  ON outbound_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION outbound_record_prospect_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO outbound_audit_log (
      actor_type,
      action,
      entity_type,
      entity_id,
      previous_values,
      new_values,
      metadata
    )
    VALUES (
      'database_trigger',
      'prospect.status_changed',
      'prospect',
      NEW.id::TEXT,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('source', 'database_trigger')
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'outbound_prospect_status_audit_trigger'
       AND tgrelid = 'outbound_prospects'::regclass
  ) THEN
    CREATE TRIGGER outbound_prospect_status_audit_trigger
      AFTER UPDATE OF status ON outbound_prospects
      FOR EACH ROW
      EXECUTE FUNCTION outbound_record_prospect_status_change();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION outbound_reject_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'outbound_audit_log is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION outbound_record_opportunity_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO outbound_audit_log (
      actor_type,
      action,
      entity_type,
      entity_id,
      previous_values,
      new_values,
      metadata
    )
    VALUES (
      'database_trigger',
      'opportunity.status_changed',
      'opportunity',
      NEW.id::TEXT,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('source', 'database_trigger')
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'outbound_opportunity_status_audit_trigger'
       AND tgrelid = 'outbound_opportunities'::regclass
  ) THEN
    CREATE TRIGGER outbound_opportunity_status_audit_trigger
      AFTER UPDATE OF status ON outbound_opportunities
      FOR EACH ROW
      EXECUTE FUNCTION outbound_record_opportunity_status_change();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'outbound_audit_log_immutable_trigger'
       AND tgrelid = 'outbound_audit_log'::regclass
  ) THEN
    CREATE TRIGGER outbound_audit_log_immutable_trigger
      BEFORE UPDATE OR DELETE ON outbound_audit_log
      FOR EACH ROW
      EXECUTE FUNCTION outbound_reject_audit_mutation();
  END IF;
END;
$$;

COMMIT;
