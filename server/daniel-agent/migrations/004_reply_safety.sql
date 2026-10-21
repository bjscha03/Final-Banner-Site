-- Replies are counted separately, never charged to prospecting allowances.
ALTER TABLE daniel_sales.daily_limits DROP CONSTRAINT IF EXISTS daily_limits_kind_check;
ALTER TABLE daniel_sales.daily_limits ADD CONSTRAINT daily_limits_kind_check CHECK(kind IN ('intro','followup','reply'));
CREATE OR REPLACE FUNCTION daniel_sales.claim_dispatch_message(mid uuid, quota_limit integer, test_recipient text DEFAULT NULL) RETURNS SETOF daniel_sales.messages LANGUAGE plpgsql AS $$
DECLARE m daniel_sales.messages; c daniel_sales.contacts; k text; d date; used integer;
BEGIN
 PERFORM pg_advisory_xact_lock(655,1);
 SELECT * INTO m FROM daniel_sales.messages WHERE id=mid FOR UPDATE;
 IF m.id IS NULL OR m.status<>'queued' OR m.due_at>now() OR m.approved_at IS NULL THEN RETURN; END IF;
 SELECT * INTO c FROM daniel_sales.contacts WHERE id=m.contact_id FOR UPDATE;
 IF c.id IS NULL OR c.suppressed_at IS NOT NULL OR EXISTS(SELECT 1 FROM daniel_sales.suppressions WHERE email=lower(c.email)) OR (m.kind IN ('intro','followup') AND c.replied_at IS NOT NULL) OR (test_recipient IS NOT NULL AND lower(c.email)<>lower(test_recipient)) OR (test_recipient IS NULL AND (SELECT paused FROM daniel_sales.settings WHERE id=1)) THEN
 UPDATE daniel_sales.messages SET status='blocked',error='Contact suppressed, replied, or agent paused',updated_at=now() WHERE id=mid; RETURN;
 END IF;
 IF m.kind<>'reply' AND EXISTS(SELECT 1 FROM daniel_sales.opportunities WHERE id=m.opportunity_id AND stage IN ('won','lost','do_not_contact')) THEN RETURN; END IF;
 IF m.kind='reply' THEN
  -- One response per real inbound message; never respond to automated mail.
  IF m.reply_to_id IS NULL OR m.thread_key IS NULL OR NOT EXISTS(
   SELECT 1 FROM daniel_sales.messages i WHERE i.contact_id=m.contact_id AND i.direction='inbound'
   AND i.rfc_message_id=m.reply_to_id AND i.thread_key=m.thread_key AND i.status='received'
   AND i.classification NOT IN ('automated','unsubscribe','decline')) THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM daniel_sales.messages r JOIN daniel_sales.contacts rc ON rc.id=r.contact_id WHERE r.id<>m.id AND r.direction='outbound'
   AND r.kind='reply' AND lower(rc.email)=lower(c.email) AND r.reply_to_id=m.reply_to_id
   AND r.status IN ('sending','uncertain','sent','simulated')) THEN RETURN; END IF;
  -- Per-recipient rolling safety throttle, independent of prospecting allowances.
  IF (SELECT count(*) FROM daniel_sales.messages r JOIN daniel_sales.contacts rc ON rc.id=r.contact_id
   WHERE lower(rc.email)=lower(c.email) AND r.direction='outbound' AND r.kind='reply'
   AND r.status IN ('sending','uncertain','sent','simulated')
   AND coalesce(r.sent_at,r.updated_at)>now()-interval '1 hour')>=6 THEN RETURN; END IF;
 END IF;
 k=m.kind; d=(now() AT TIME ZONE 'America/New_York')::date;
 INSERT INTO daniel_sales.daily_limits(local_date,kind) VALUES(d,k) ON CONFLICT DO NOTHING;
 SELECT sent_count+reserved_count INTO used FROM daniel_sales.daily_limits WHERE local_date=d AND kind=k FOR UPDATE;
 IF k IN ('intro','followup') AND used>=(CASE WHEN k='intro' THEN 10 ELSE 5 END) THEN RETURN; END IF;
 UPDATE daniel_sales.daily_limits SET reserved_count=reserved_count+1 WHERE local_date=d AND kind=k;
 RETURN QUERY UPDATE daniel_sales.messages SET status='sending',lease_until=now()+interval '3 minutes',attempt_count=attempt_count+1,quota_date=d,quota_kind=k,updated_at=now() WHERE id=mid RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION daniel_sales.claim_message(mid uuid, quota_limit integer) RETURNS SETOF daniel_sales.messages LANGUAGE sql AS $$
 SELECT * FROM daniel_sales.claim_dispatch_message(mid,quota_limit,NULL)
$$;
CREATE OR REPLACE FUNCTION daniel_sales.claim_test_message(mid uuid, quota_limit integer, test_recipient text) RETURNS SETOF daniel_sales.messages LANGUAGE sql AS $$
 SELECT * FROM daniel_sales.claim_dispatch_message(mid,quota_limit,test_recipient) WHERE test_recipient IS NOT NULL
$$;

-- Move historical reply reservations/counts once; preserve imported outreach totals.
WITH moved AS (
 UPDATE daniel_sales.messages SET quota_kind='reply'
 WHERE kind='reply' AND quota_kind='followup' AND quota_date IS NOT NULL
 RETURNING quota_date,status
), totals AS (
 SELECT quota_date,count(*) FILTER(WHERE status IN ('sent','simulated'))::int AS sent,
 count(*) FILTER(WHERE status IN ('sending','uncertain'))::int AS reserved FROM moved GROUP BY quota_date
), released AS (
 UPDATE daniel_sales.daily_limits d SET sent_count=greatest(0,d.sent_count-t.sent),reserved_count=greatest(0,d.reserved_count-t.reserved)
 FROM totals t WHERE d.local_date=t.quota_date AND d.kind='followup' RETURNING d.local_date
)
INSERT INTO daniel_sales.daily_limits(local_date,kind,sent_count,reserved_count)
 SELECT quota_date,'reply',sent,reserved FROM totals
 ON CONFLICT(local_date,kind) DO UPDATE SET sent_count=daniel_sales.daily_limits.sent_count+excluded.sent_count,reserved_count=daniel_sales.daily_limits.reserved_count+excluded.reserved_count;
