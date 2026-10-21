ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS auto_prospect boolean NOT NULL DEFAULT false;
ALTER TABLE daniel_sales.contacts ADD COLUMN IF NOT EXISTS research jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS daniel_sales.discovery_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slot text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'running', started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, evidence jsonb NOT NULL DEFAULT '{}', error text
);
CREATE TABLE IF NOT EXISTS daniel_sales.report_outbox (
 report_key text PRIMARY KEY, local_date date NOT NULL, recipient text NOT NULL,
 subject text NOT NULL, html text NOT NULL, rfc_message_id text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'queued', provider_message_id text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, error text
);

-- Called only by authenticated expiring allowlist test dispatch; regular agent remains paused.
CREATE OR REPLACE FUNCTION daniel_sales.claim_test_message(mid uuid, quota_limit integer, test_recipient text) RETURNS SETOF daniel_sales.messages LANGUAGE plpgsql AS $$
DECLARE m daniel_sales.messages; c daniel_sales.contacts; k text; d date; used integer;
BEGIN
 PERFORM pg_advisory_xact_lock(655,1);
 SELECT * INTO m FROM daniel_sales.messages WHERE id=mid FOR UPDATE;
 IF m.id IS NULL OR m.status<>'queued' OR m.due_at>now() OR m.approved_at IS NULL THEN RETURN; END IF;
 SELECT * INTO c FROM daniel_sales.contacts WHERE id=m.contact_id FOR UPDATE;
 IF c.id IS NULL OR c.suppressed_at IS NOT NULL OR EXISTS(SELECT 1 FROM daniel_sales.suppressions WHERE email=lower(c.email)) OR (m.kind IN ('intro','followup') AND c.replied_at IS NOT NULL) OR lower(c.email)<>lower(test_recipient) OR test_recipient IS NULL THEN
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
