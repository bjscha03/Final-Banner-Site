ALTER TABLE daniel_sales.accounts ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE daniel_sales.contacts ADD COLUMN IF NOT EXISTS replied_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS daniel_contact_email ON daniel_sales.contacts(lower(email));
ALTER TABLE daniel_sales.opportunities ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT 'Daniel';
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '';
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply';
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS due_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS rfc_message_id text;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES daniel_sales.opportunities(id);
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS ai_metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS quota_date date;
ALTER TABLE daniel_sales.messages ADD COLUMN IF NOT EXISTS quota_kind text;
ALTER TABLE daniel_sales.tasks ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES daniel_sales.contacts(id);
ALTER TABLE daniel_sales.tasks ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
ALTER TABLE daniel_sales.tasks ADD COLUMN IF NOT EXISTS dedupe_key text UNIQUE;
ALTER TABLE daniel_sales.approvals ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES daniel_sales.messages(id);
ALTER TABLE daniel_sales.approvals ADD COLUMN IF NOT EXISTS decided_by text;
ALTER TABLE daniel_sales.approvals ADD COLUMN IF NOT EXISTS decision_note text;
ALTER TABLE daniel_sales.approvals ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS daniel_pending_approval ON daniel_sales.approvals(message_id) WHERE decision='pending';
CREATE TABLE IF NOT EXISTS daniel_sales.suppressions(email text PRIMARY KEY, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL);
CREATE TABLE IF NOT EXISTS daniel_sales.sessions(token_hash text PRIMARY KEY, actor text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS daniel_sales.login_attempts(ip_hash text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS daniel_sales.settings(id integer PRIMARY KEY CHECK(id=1), paused boolean NOT NULL DEFAULT false, auto_reply boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO daniel_sales.settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS daniel_sales.mailbox(id integer PRIMARY KEY CHECK(id=1), email text, encrypted_refresh_token text, history_id text, page_token text, sync_start_history text, initial_query text, last_sync_at timestamptz, last_error text);
CREATE TABLE IF NOT EXISTS daniel_sales.oauth_states(state_hash text PRIMARY KEY, session_hash text NOT NULL, verifier text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS daniel_sales.worker_locks(name text PRIMARY KEY, owner text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS daniel_sales.runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, status text NOT NULL DEFAULT 'running', summary jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS daniel_sales.test_deliveries(message_id uuid PRIMARY KEY REFERENCES daniel_sales.messages(id), recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, thread_key text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS daniel_sales.meetings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES daniel_sales.opportunities(id), title text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, location text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'scheduled', CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS daniel_sales.daily_reports(local_date date PRIMARY KEY, data jsonb NOT NULL, generated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS daniel_sales.knowledge(version text PRIMARY KEY, facts jsonb NOT NULL, approved_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO daniel_sales.knowledge(version,facts,approved_by) VALUES('bof-v1','{"company":"Banners On The Fly","website":"https://bannersonthefly.com","products":["vinyl banners","mesh banners","yard signs","car magnets"],"vinyl_banner_production":"24-hour production","vinyl_banner_shipping":"Free Next-Day Air shipping in the U.S. for qualifying orders of $20 or more","exceptions":"Production timing and shipping for other products must be confirmed. Never guarantee carrier arrival dates. Custom pricing, discounts, credit terms, contracts, refunds and capacity commitments require owner approval.","supplier_policy":"Sell to end customers only; never source production suppliers."}'::jsonb,'existing BOF business rules') ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS daniel_outbox_due ON daniel_sales.messages(due_at) WHERE status='queued';
CREATE INDEX IF NOT EXISTS daniel_messages_contact ON daniel_sales.messages(contact_id,created_at);
-- Claims and quota reservations are serialized in the database, across all workers.
CREATE OR REPLACE FUNCTION daniel_sales.claim_message(mid uuid, quota_limit integer) RETURNS SETOF daniel_sales.messages LANGUAGE plpgsql AS $$
DECLARE m daniel_sales.messages; c daniel_sales.contacts; k text; d date; used integer;
BEGIN
 PERFORM pg_advisory_xact_lock(655,1);
 SELECT * INTO m FROM daniel_sales.messages WHERE id=mid FOR UPDATE;
 IF m.id IS NULL OR m.status<>'queued' OR m.due_at>now() OR m.approved_at IS NULL THEN RETURN; END IF;
 SELECT * INTO c FROM daniel_sales.contacts WHERE id=m.contact_id FOR UPDATE;
 IF c.id IS NULL OR c.suppressed_at IS NOT NULL OR EXISTS(SELECT 1 FROM daniel_sales.suppressions WHERE email=lower(c.email)) OR (m.kind IN ('intro','followup') AND c.replied_at IS NOT NULL) OR (SELECT paused FROM daniel_sales.settings WHERE id=1) THEN
 UPDATE daniel_sales.messages SET status='blocked',error='Contact suppressed, replied, or agent paused',updated_at=now() WHERE id=mid; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM daniel_sales.opportunities WHERE id=m.opportunity_id AND stage IN ('won','lost','do_not_contact')) THEN RETURN; END IF;
 k=CASE WHEN m.kind='intro' THEN 'intro' ELSE 'followup' END; d=(now() AT TIME ZONE 'America/New_York')::date;
 INSERT INTO daniel_sales.daily_limits(local_date,kind) VALUES(d,k) ON CONFLICT DO NOTHING;
 SELECT sent_count+reserved_count INTO used FROM daniel_sales.daily_limits WHERE local_date=d AND kind=k FOR UPDATE;
 IF used>=quota_limit THEN RETURN; END IF;
 UPDATE daniel_sales.daily_limits SET reserved_count=reserved_count+1 WHERE local_date=d AND kind=k;
 RETURN QUERY UPDATE daniel_sales.messages SET status='sending',lease_until=now()+interval '3 minutes',attempt_count=attempt_count+1,quota_date=d,quota_kind=k,updated_at=now() WHERE id=mid RETURNING *;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='daniel_meeting_no_overlap' AND connamespace='daniel_sales'::regnamespace) THEN
 ALTER TABLE daniel_sales.meetings ADD CONSTRAINT daniel_meeting_no_overlap EXCLUDE USING gist (tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status='scheduled');
 END IF;
END $$;
