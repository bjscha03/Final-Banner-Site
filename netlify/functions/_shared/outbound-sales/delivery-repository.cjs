'use strict';

const { sanitizeForAudit } = require('./security.cjs');

async function loadShadowDeliveryCandidates(sql, limit = 30) {
  const safeLimit = Math.max(0, Math.min(30, Number(limit) || 0));
  return sql(
    `SELECT m.id AS message_id, m.prospect_id, m.contact_id, m.campaign_id,
            m.subject, m.body_text, m.body_html, m.generation_status,
            m.evidence_validation_status, m.delivery_state,
            p.business_name, p.status AS prospect_status, p.lead_score,
            p.first_contacted_at, p.prior_customer_match, p.suppression_reason,
            c.email, c.syntax_valid, c.mx_status, c.is_role_address,
            c.is_free_mailbox, c.domain_matches, c.verification_status
       FROM outbound_messages m
       JOIN outbound_prospects p ON p.id=m.prospect_id
       JOIN outbound_contacts c ON c.id=m.contact_id AND c.active=TRUE
      WHERE m.message_kind='initial'
        AND m.status='draft'
        AND m.generation_status='generated'
        AND m.evidence_validation_status='passed'
        AND m.delivery_state='not_planned'
        AND p.status='ready_for_outreach'
        AND p.first_contacted_at IS NULL
        AND p.prior_customer_match=FALSE
        AND p.suppression_reason IS NULL
        AND c.syntax_valid=TRUE AND c.mx_status='present'
        AND c.is_role_address=FALSE AND c.is_free_mailbox=FALSE
        AND c.domain_matches=TRUE
        AND NOT EXISTS (
          SELECT 1 FROM outbound_suppressions s
           WHERE s.active=TRUE AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND ((s.scope='email' AND LOWER(s.normalized_value)=LOWER(c.email_normalized))
               OR (s.scope IN ('company_domain','email_domain') AND LOWER(s.normalized_value)=LOWER(p.canonical_domain)))
        )
      ORDER BY p.lead_score DESC NULLS LAST, p.discovered_at
      LIMIT $1`,
    [safeLimit],
  );
}

async function saveShadowDeliveryPlan(sql, campaignId, assignments) {
  const saved = [];
  for (const item of assignments) {
    const rows = await sql(
      `UPDATE outbound_messages
          SET campaign_id=COALESCE(campaign_id,$2),
              delivery_state='shadow_planned', planned_send_at=$3,
              delivery_metadata=delivery_metadata || $4::jsonb,
              updated_at=NOW()
        WHERE id=$1 AND status='draft' AND generation_status='generated'
          AND evidence_validation_status='passed'
       RETURNING id, prospect_id, campaign_id, delivery_state, planned_send_at`,
      [item.messageId, campaignId, item.plannedSendAt, JSON.stringify(sanitizeForAudit({ shadowMode: true, wouldSend: true, plannedAt: item.plannedSendAt }))],
    );
    if (rows[0]) saved.push(rows[0]);
  }
  return saved;
}

async function recordShadowPlannedCount(sql, businessDate, count) {
  const amount = Math.max(0, Math.min(30, Number(count) || 0));
  if (!amount) return null;
  const rows = await sql(
    `INSERT INTO outbound_daily_delivery_counters (business_date,planned_count)
     VALUES ($1,$2)
     ON CONFLICT (business_date) DO UPDATE
       SET planned_count=outbound_daily_delivery_counters.planned_count+$2,
           updated_at=NOW()
     RETURNING business_date,planned_count`,
    [businessDate, amount],
  );
  return rows[0] || null;
}

async function loadDailyCounters(sql, businessDate) {
  const rows = await sql(
    `INSERT INTO outbound_daily_delivery_counters (business_date) VALUES ($1)
     ON CONFLICT (business_date) DO UPDATE SET updated_at=outbound_daily_delivery_counters.updated_at
     RETURNING *`,
    [businessDate],
  );
  return rows[0] || null;
}

async function recordCircuitBreaker(sql, data) {
  const rows = await sql(
    `INSERT INTO outbound_circuit_breaker_events (
       breaker_key, previous_state, new_state, reason_code,
       observed_metrics, opened_until
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     RETURNING id`,
    [data.breakerKey, data.previousState, data.newState, data.reasonCode,
      JSON.stringify(sanitizeForAudit(data.observedMetrics || {})), data.openedUntil || null],
  );
  return rows[0] || null;
}

async function claimLiveDelivery(sql, data) {
  const rows = await sql(
    `WITH counter AS (
       INSERT INTO outbound_daily_delivery_counters (business_date,attempted_count)
       SELECT $2,1 WHERE $3>0
       ON CONFLICT (business_date) DO UPDATE
         SET attempted_count=outbound_daily_delivery_counters.attempted_count+1,
             updated_at=NOW()
         WHERE outbound_daily_delivery_counters.attempted_count < $3
       RETURNING business_date
     )
     UPDATE outbound_messages m
        SET status='sending',delivery_state='sending',send_attempt_count=send_attempt_count+1,
            send_key=COALESCE(send_key,$4),last_send_error_code=NULL,updated_at=NOW()
       FROM outbound_prospects p,outbound_contacts c,counter
      WHERE m.id=$1 AND p.id=m.prospect_id AND c.id=m.contact_id
        AND m.status IN ('ready','scheduled') AND m.delivery_state='ready'
        AND m.generation_status='generated' AND m.evidence_validation_status='passed'
        AND m.planned_send_at<=NOW() AND m.send_attempt_count<3
        AND p.status='ready_for_outreach' AND p.first_contacted_at IS NULL
        AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL
        AND c.active=TRUE AND c.send_eligible=TRUE
        AND NOT EXISTS (
          SELECT 1 FROM outbound_suppressions s
           WHERE s.active=TRUE AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND ((s.scope='email' AND LOWER(s.normalized_value)=LOWER(c.email_normalized))
               OR (s.scope IN ('company_domain','email_domain') AND LOWER(s.normalized_value)=LOWER(p.canonical_domain)))
        )
      RETURNING m.id,m.prospect_id,m.contact_id,m.campaign_id,m.subject,
                m.body_text,m.body_html,m.generation_status,m.evidence_validation_status,
                m.delivery_state,m.send_key,m.send_attempt_count,c.email,c.send_eligible,
                p.business_name,p.status AS prospect_status`,
    [data.messageId, data.businessDate, Math.max(0, Math.min(30, Number(data.dailyLimit) || 0)), data.sendKey],
  );
  return rows[0] || null;
}

async function saveUnsubscribeToken(sql, data) {
  const rows = await sql(
    `INSERT INTO outbound_unsubscribe_tokens (
       token_hash,prospect_id,contact_id,message_id,expires_at
     ) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (token_hash) DO UPDATE SET expires_at=GREATEST(outbound_unsubscribe_tokens.expires_at,EXCLUDED.expires_at)
     RETURNING id`,
    [data.tokenHash, data.prospectId, data.contactId, data.messageId, data.expiresAt],
  );
  return rows[0] || null;
}

async function markDeliverySent(sql, data) {
  const rows = await sql(
    `WITH message_update AS (
       UPDATE outbound_messages
          SET status='sent',delivery_state='sent',resend_message_id=$2,
              sent_at=NOW(),last_send_latency_ms=$3,next_send_attempt_at=NULL,
              last_send_error_code=NULL,updated_at=NOW()
        WHERE id=$1 AND status='sending' AND delivery_state='sending'
       RETURNING id,prospect_id
     ), prospect_update AS (
       UPDATE outbound_prospects p
          SET status='contacted',first_contacted_at=COALESCE(first_contacted_at,NOW()),updated_at=NOW()
         FROM message_update m WHERE p.id=m.prospect_id RETURNING p.id
     ), counter_update AS (
       UPDATE outbound_daily_delivery_counters SET sent_count=sent_count+1,updated_at=NOW()
        WHERE business_date=$4 AND EXISTS (SELECT 1 FROM message_update) RETURNING business_date
     ), event_insert AS (
       INSERT INTO outbound_email_events (message_id,provider_event_id,event_type,event_status,event_summary,event_at)
       SELECT id,$5,'sent','accepted',$6::jsonb,NOW() FROM message_update
       ON CONFLICT (provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING RETURNING id
     ) SELECT * FROM message_update`,
    [data.messageId, data.providerMessageId, data.latencyMs, data.businessDate,
      `send:${data.messageId}`, JSON.stringify(sanitizeForAudit({ provider: 'resend', latencyMs: data.latencyMs }))],
  );
  return rows[0] || null;
}

async function markDeliveryFailed(sql, data) {
  const rows = await sql(
    `WITH message_update AS (
       UPDATE outbound_messages
          SET status=CASE WHEN send_attempt_count>=3 THEN 'failed' ELSE 'ready' END,
              delivery_state=CASE WHEN send_attempt_count>=3 THEN 'failed' ELSE 'ready' END,
              next_send_attempt_at=CASE WHEN send_attempt_count>=3 THEN NULL ELSE $3 END,
              last_send_error_code=$2,last_send_latency_ms=$4,updated_at=NOW()
        WHERE id=$1 AND status='sending' AND delivery_state='sending'
       RETURNING id,send_attempt_count,status,next_send_attempt_at
     ), counter_update AS (
       UPDATE outbound_daily_delivery_counters SET failed_count=failed_count+1,updated_at=NOW()
        WHERE business_date=$5 AND EXISTS (SELECT 1 FROM message_update) RETURNING business_date
     ) SELECT * FROM message_update`,
    [data.messageId, String(data.errorCode || 'OUTBOUND_SEND_FAILED').slice(0, 100),
      data.nextAttemptAt || null, data.latencyMs ?? null, data.businessDate],
  );
  return rows[0] || null;
}

async function pauseForCircuitBreaker(sql, data) {
  const rows = await sql(
    `UPDATE outbound_settings
        SET emergency_paused=TRUE,settings_version=settings_version+1,
            updated_by='delivery_circuit_breaker',updated_at=NOW()
      WHERE id=1 AND emergency_paused=FALSE
      RETURNING id,emergency_paused,settings_version`,
  );
  if (rows[0]) await recordCircuitBreaker(sql, {
    breakerKey: 'outbound_delivery', previousState: 'closed', newState: 'open',
    reasonCode: data.reasonCode, observedMetrics: data.observedMetrics,
    openedUntil: data.openedUntil || null,
  });
  return rows[0] || null;
}

module.exports = {
  loadShadowDeliveryCandidates,
  saveShadowDeliveryPlan,
  recordShadowPlannedCount,
  loadDailyCounters,
  recordCircuitBreaker,
  claimLiveDelivery,
  saveUnsubscribeToken,
  markDeliverySent,
  markDeliveryFailed,
  pauseForCircuitBreaker,
};
