-- Phase 6: read-only order attribution candidates, learning, and monitoring.
-- Additive and outbound-only; source order IDs are opaque and have no legacy FK.

BEGIN;

ALTER TABLE outbound_settings
  ADD COLUMN IF NOT EXISTS attribution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS learning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS minimum_learning_sample INTEGER NOT NULL DEFAULT 60
    CHECK (minimum_learning_sample >= 30),
  ADD COLUMN IF NOT EXISTS exploration_percent NUMERIC(5,2) NOT NULL DEFAULT 15.00
    CHECK (exploration_percent BETWEEN 5 AND 30);

CREATE TABLE IF NOT EXISTS outbound_attribution_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_order_id UUID NOT NULL,
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id) ON DELETE RESTRICT,
  opportunity_id UUID REFERENCES outbound_opportunities(id) ON DELETE SET NULL,
  message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES outbound_campaigns(id) ON DELETE SET NULL,
  candidate_method TEXT NOT NULL CHECK (candidate_method IN (
    'signed_link', 'reply_email', 'quote_request', 'email_match',
    'domain_match', 'promotion_code'
  )),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  gross_revenue_cents INTEGER NOT NULL CHECK (gross_revenue_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  source_order_status TEXT,
  is_test_order BOOLEAN NOT NULL DEFAULT FALSE,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'auto_approved', 'approved', 'rejected', 'superseded')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_order_id, prospect_id, candidate_method)
);

CREATE INDEX IF NOT EXISTS outbound_attribution_candidates_review_idx
  ON outbound_attribution_candidates (review_status, confidence DESC, observed_at DESC);

CREATE TABLE IF NOT EXISTS outbound_performance_daily (
  metric_date DATE NOT NULL,
  dimension_type TEXT NOT NULL CHECK (dimension_type IN ('overall', 'industry', 'campaign', 'variant', 'send_hour')),
  dimension_key TEXT NOT NULL,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  qualified_reply_count INTEGER NOT NULL DEFAULT 0,
  quote_request_count INTEGER NOT NULL DEFAULT 0,
  paid_order_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  bounced_count INTEGER NOT NULL DEFAULT 0,
  complained_count INTEGER NOT NULL DEFAULT 0,
  unsubscribed_count INTEGER NOT NULL DEFAULT 0,
  openai_cost_microusd BIGINT NOT NULL DEFAULT 0,
  provider_cost_microusd BIGINT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (metric_date, dimension_type, dimension_key)
);

CREATE INDEX IF NOT EXISTS outbound_performance_daily_dimension_idx
  ON outbound_performance_daily (dimension_type, dimension_key, metric_date DESC);

CREATE TABLE IF NOT EXISTS outbound_learning_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_type TEXT NOT NULL CHECK (dimension_type IN ('industry', 'subject_line_style', 'call_to_action_style', 'email_length', 'offer_framing', 'industry_positioning', 'send_hour')),
  dimension_key TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('increase', 'hold', 'decrease', 'pause')),
  current_weight NUMERIC(10,6) NOT NULL DEFAULT 1 CHECK (current_weight >= 0),
  recommended_weight NUMERIC(10,6) NOT NULL CHECK (recommended_weight >= 0),
  sample_size INTEGER NOT NULL CHECK (sample_size >= 0),
  primary_metric TEXT NOT NULL CHECK (primary_metric IN ('qualified_replies', 'quote_requests', 'paid_orders', 'revenue')),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  safety_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'applied', 'rejected', 'expired')),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_learning_recommendations_status_idx
  ON outbound_learning_recommendations (status, dimension_type, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  alert_code TEXT NOT NULL,
  component TEXT NOT NULL,
  summary TEXT NOT NULL,
  diagnostic_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alert_code, component, status)
);

CREATE INDEX IF NOT EXISTS outbound_operational_alerts_open_idx
  ON outbound_operational_alerts (severity, last_observed_at DESC)
  WHERE status IN ('open', 'acknowledged');

COMMIT;
