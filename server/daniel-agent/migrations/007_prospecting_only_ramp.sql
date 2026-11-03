-- Migration 007_prospecting_only_ramp, owner work order November 3, 2026.
-- Additive configuration only. Existing messages, approvals, tasks,
-- suppressions and quota counters are retained without mass updates.
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS auto_followup boolean NOT NULL DEFAULT false;
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS reply_mode text NOT NULL DEFAULT 'manual_only' CHECK (reply_mode='manual_only');
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS intro_daily_limit integer NOT NULL DEFAULT 25 CHECK (intro_daily_limit BETWEEN 0 AND 25);
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS followup_daily_limit integer NOT NULL DEFAULT 15 CHECK (followup_daily_limit BETWEEN 0 AND 15);
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS outreach_pacing_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS discovery_interval_minutes integer NOT NULL DEFAULT 15 CHECK (discovery_interval_minutes BETWEEN 15 AND 60);
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS discovery_daily_limit integer NOT NULL DEFAULT 48 CHECK (discovery_daily_limit BETWEEN 0 AND 48);
UPDATE daniel_sales.settings SET auto_reply=false,updated_at=now() WHERE id=1 AND auto_reply=true;

-- Caller-supplied limits, clocks and controlled-test permissions cannot enable
-- prospect replies or override database-owned outbound limits.
CREATE OR REPLACE FUNCTION daniel_sales.claim_dispatch_message(mid uuid, quota_limit integer, test_recipient text DEFAULT NULL) RETURNS SETOF daniel_sales.messages LANGUAGE plpgsql AS $$
DECLARE
 m daniel_sales.messages;
 c daniel_sales.contacts;
 s daniel_sales.settings;
 k text;
 d date;
 used integer;
 cap integer;
 allowance integer;
 local_now timestamp;
 elapsed_minutes integer;
 slot_start timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(655,1);
 SELECT * INTO m FROM daniel_sales.messages WHERE id=mid FOR UPDATE;
 IF m.id IS NULL OR m.status<>'queued' OR m.due_at>now() OR m.approved_at IS NULL THEN RETURN; END IF;
 IF m.kind='reply' OR m.kind NOT IN ('intro','followup') THEN RETURN; END IF;
 SELECT * INTO s FROM daniel_sales.settings WHERE id=1;
 IF s.id IS NULL OR s.paused OR s.cold_outreach_paused OR s.auto_reply OR s.reply_mode<>'manual_only' THEN RETURN; END IF;
 IF (m.kind='intro' AND NOT s.auto_prospect) OR (m.kind='followup' AND NOT s.auto_followup) THEN RETURN; END IF;
 SELECT * INTO c FROM daniel_sales.contacts WHERE id=m.contact_id FOR UPDATE;
 IF c.id IS NULL OR c.suppressed_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM daniel_sales.suppressions WHERE email=lower(c.email))
    OR EXISTS(SELECT 1 FROM daniel_sales.contacts peer WHERE peer.account_id=c.account_id AND peer.replied_at IS NOT NULL)
    OR (test_recipient IS NOT NULL AND lower(c.email)<>lower(test_recipient)) THEN
  UPDATE daniel_sales.messages SET status='blocked',error='Contact suppressed, account replied, or test recipient mismatch',updated_at=now() WHERE id=mid;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM daniel_sales.opportunities WHERE id=m.opportunity_id AND stage IN ('won','lost','do_not_contact')) THEN RETURN; END IF;
 IF s.required_draft_contract IS NOT NULL AND m.ai_metadata->>'generation_contract' IS DISTINCT FROM s.required_draft_contract THEN RETURN; END IF;
 local_now=now() AT TIME ZONE 'America/New_York';
 IF extract(isodow FROM local_now)>5 OR local_now::time<time '08:00' OR local_now::time>=time '20:00' THEN RETURN; END IF;
 k=m.kind;d=local_now::date;
 cap=CASE WHEN k='intro' THEN least(s.intro_daily_limit,25) ELSE least(s.followup_daily_limit,15) END;
 IF cap<=0 THEN RETURN; END IF;
 elapsed_minutes=extract(hour FROM local_now)::integer*60+extract(minute FROM local_now)::integer-480;
 allowance=cap;
 IF s.outreach_pacing_enabled THEN
  allowance=least(cap,1+floor(elapsed_minutes*cap/720.0)::integer);
  slot_start=to_timestamp(floor(extract(epoch FROM now())/900)*900);
  -- One combined introduction/follow-up claim per slot. Also maintain a
  -- ten-minute minimum gap across slot boundaries; missed slots never turn
  -- into a catch-up burst. Uncertain deliveries conservatively occupy space.
  IF EXISTS(SELECT 1 FROM daniel_sales.messages prior
    WHERE prior.direction='outbound' AND prior.kind IN ('intro','followup')
      AND prior.status IN ('sending','uncertain','sent','simulated')
      AND ((coalesce(prior.sent_at,prior.updated_at)>=slot_start
        AND coalesce(prior.sent_at,prior.updated_at)<slot_start+interval '15 minutes')
        OR coalesce(prior.sent_at,prior.updated_at)>now()-interval '10 minutes')) THEN RETURN; END IF;
 END IF;
 INSERT INTO daniel_sales.daily_limits(local_date,kind) VALUES(d,k) ON CONFLICT DO NOTHING;
 SELECT sent_count+reserved_count INTO used FROM daniel_sales.daily_limits WHERE local_date=d AND kind=k FOR UPDATE;
 IF used>=allowance THEN RETURN; END IF;
 UPDATE daniel_sales.daily_limits SET reserved_count=reserved_count+1 WHERE local_date=d AND kind=k;
 RETURN QUERY UPDATE daniel_sales.messages SET status='sending',lease_until=now()+interval '3 minutes',attempt_count=attempt_count+1,quota_date=d,quota_kind=k,updated_at=now() WHERE id=mid RETURNING *;
END $$;
