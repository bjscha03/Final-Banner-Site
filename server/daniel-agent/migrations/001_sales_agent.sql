-- Dedicated isolated schema. Apply only to a verified development database first.
CREATE SCHEMA IF NOT EXISTS daniel_sales;
CREATE TABLE IF NOT EXISTS daniel_sales.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, website text,
 segment text, location_count integer CHECK(location_count IS NULL OR location_count >= 0),
 source_url text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daniel_sales.contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES daniel_sales.accounts(id),
 name text, role text, email text NOT NULL, verified_source_url text NOT NULL,
 suppressed_at timestamptz, suppression_reason text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,email)
);
CREATE TABLE IF NOT EXISTS daniel_sales.opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES daniel_sales.accounts(id),
 stage text NOT NULL DEFAULT 'researched' CHECK(stage IN ('researched','qualified','contacted','replied','interested','quote_requested','quote_pending_approval','quoted','negotiation','won','lost','nurture','do_not_contact')),
 product_interest text, estimated_quantity integer, next_action text, next_action_at timestamptz,
 approval_state text NOT NULL DEFAULT 'none', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(stage IN ('won','lost','do_not_contact') OR (next_action IS NOT NULL AND next_action_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS daniel_sales.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES daniel_sales.contacts(id),
 thread_key text, provider_message_id text UNIQUE, idempotency_key text UNIQUE NOT NULL,
 direction text NOT NULL CHECK(direction IN ('inbound','outbound')), classification text,
 status text NOT NULL DEFAULT 'pending', body text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daniel_sales.tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid REFERENCES daniel_sales.opportunities(id),
 kind text NOT NULL, due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending',
 attempt_count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS daniel_sales.daily_limits (
 local_date date NOT NULL, kind text NOT NULL CHECK(kind IN ('intro','followup')),
 reserved_count integer NOT NULL DEFAULT 0, sent_count integer NOT NULL DEFAULT 0,
 PRIMARY KEY(local_date,kind), CHECK(reserved_count >= 0 AND sent_count >= 0)
);
CREATE TABLE IF NOT EXISTS daniel_sales.approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid REFERENCES daniel_sales.opportunities(id),
 request_type text NOT NULL, proposal_json jsonb NOT NULL DEFAULT '{}',
 decision text NOT NULL DEFAULT 'pending', decided_at timestamptz
);
CREATE TABLE IF NOT EXISTS daniel_sales.audit_events (
 id bigserial PRIMARY KEY, entity_type text NOT NULL, entity_id text NOT NULL,
 event_type text NOT NULL, actor text NOT NULL, metadata_json jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daniel_tasks_due ON daniel_sales.tasks(due_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS daniel_opportunities_next ON daniel_sales.opportunities(next_action_at);
-- Database role should be provisioned separately with access ONLY to daniel_sales.
