'use strict';

const { sanitizeForAudit } = require('./security.cjs');

const MIN_HIGH_VALUE_SCORE = 60;
const MAX_MANUAL_DAILY_ATTEMPTS = 70;

function technicalBlockers(row) {
  const blockers = [];
  if (!row.contact_id) blockers.push('No active business email');
  if (row.contact_id && row.syntax_valid !== true) blockers.push('Email syntax is not valid');
  if (row.contact_id && !['present', 'not_checked'].includes(row.mx_status)) blockers.push('Email domain has no confirmed mail server');
  if (row.contact_id && row.is_role_address === true) blockers.push('Role-based mailbox');
  if (row.contact_id && row.is_free_mailbox === true) blockers.push('Free mailbox');
  if (row.contact_id && row.domain_matches !== true) blockers.push('Email domain does not match the business');
  if (row.prior_customer_match === true) blockers.push('Existing customer match');
  if (row.suppression_reason) blockers.push(`Suppressed: ${row.suppression_reason}`);
  if (row.active_suppression === true) blockers.push('Active opt-out or delivery suppression');
  if (row.first_contacted_at) blockers.push('This prospect has already been contacted');
  if (!row.message_id || row.generation_status !== 'generated' || row.evidence_validation_status !== 'passed') {
    blockers.push('Branded email preview is not ready');
  }
  if (!row.message_subject || !row.message_body_text) blockers.push('Email content is incomplete');
  if (!['qualified', 'ready_for_outreach', 'contacted'].includes(row.prospect_status)) blockers.push('Prospect is not qualified');
  return [...new Set(blockers)];
}

function mapLead(row) {
  const blockers = technicalBlockers(row);
  const combinedEvidence = [
    ...(Array.isArray(row.qualification_evidence) ? row.qualification_evidence : []),
    ...(Array.isArray(row.score_explanation) ? row.score_explanation : []),
  ];
  const eventEvidence = combinedEvidence.filter((item) => {
    const text = `${item?.code || ''} ${item?.label || ''} ${item?.detail || ''} ${item?.evidence || ''}`;
    return /trade[ -]?show|conference|expo|exhibit|exhibitor|upcoming[_ ]events?|event|festival|tournament|gala/i.test(text);
  });
  const directTradeShow = eventEvidence.some((item) => /trade[ -]?show|conference|expo|exhibit|exhibitor/i.test(
    `${item?.label || ''} ${item?.detail || ''} ${item?.evidence || ''}`,
  ));
  const reviewStatus = row.review_status || 'pending';
  const permissionStatus = row.permission_status || 'unknown';
  const sendState = row.send_state || 'not_sent';
  return {
    prospectId: row.prospect_id,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    canonicalDomain: row.canonical_domain,
    industry: row.industry,
    businessType: row.business_type,
    phone: row.phone,
    leadScore: row.lead_score === null ? null : Number(row.lead_score),
    prospectStatus: row.prospect_status,
    sourceProviderId: row.source_provider_id,
    sourceUrl: row.source_url,
    scoreExplanation: row.score_explanation || [],
    qualificationEvidence: row.qualification_evidence || [],
    eventFit: {
      priority: directTradeShow ? 'trade_show' : eventEvidence.length ? 'event_signal' : 'general_high_value',
      label: directTradeShow ? 'Trade show / expo evidence' : eventEvidence.length ? 'Upcoming event evidence' : 'General high-value fit',
      evidence: eventEvidence.slice(0, 5),
    },
    contact: row.contact_id ? {
      id: row.contact_id,
      email: row.contact_email,
      fullName: row.contact_full_name,
      jobTitle: row.contact_job_title,
      sourceUrl: row.contact_source_url,
      verificationStatus: row.verification_status,
      verificationReason: row.verification_reason,
      syntaxValid: row.syntax_valid === true,
      mxStatus: row.mx_status,
      isRoleAddress: row.is_role_address === true,
      isFreeMailbox: row.is_free_mailbox === true,
      domainMatches: row.domain_matches === true,
      contactQualityScore: Number(row.contact_quality_score) || 0,
    } : null,
    message: row.message_id ? {
      id: row.message_id,
      subject: row.message_subject,
      bodyText: row.message_body_text,
      bodyHtml: row.message_body_html,
      generationStatus: row.generation_status,
      evidenceValidationStatus: row.evidence_validation_status,
      sentAt: row.message_sent_at,
    } : null,
    review: {
      status: reviewStatus,
      permissionStatus,
      permissionEvidence: row.permission_evidence || '',
      notes: row.review_notes || '',
      reviewedBy: row.reviewed_by || null,
      reviewedAt: row.reviewed_at || null,
      sendState,
      sendAttemptCount: Number(row.send_attempt_count) || 0,
      resendMessageId: row.review_resend_message_id || null,
      lastSendErrorCode: row.last_send_error_code || null,
      sentAt: row.review_sent_at || null,
    },
    technicalBlockers: blockers,
    canSend: blockers.length === 0
      && ['not_sent', 'failed'].includes(sendState),
    discoveredAt: row.discovered_at,
    lastQualifiedAt: row.last_qualified_at,
  };
}

const LEAD_SELECT = `
  SELECT p.id AS prospect_id, p.business_name, p.website_url, p.canonical_domain,
         p.phone, p.industry, p.business_type, p.lead_score,
         p.status AS prospect_status, p.source_provider_id, p.source_url,
         p.score_explanation, p.qualification_evidence, p.prior_customer_match,
         p.suppression_reason, p.first_contacted_at, p.discovered_at, p.last_qualified_at,
         review.review_status, review.permission_status, review.permission_evidence,
         review.review_notes, review.reviewed_by, review.reviewed_at,
         review.send_state, review.send_attempt_count,
         review.resend_message_id AS review_resend_message_id,
         review.last_send_error_code, review.sent_at AS review_sent_at,
         contact.id AS contact_id, contact.email AS contact_email,
         contact.full_name AS contact_full_name, contact.job_title AS contact_job_title,
         contact.source_url AS contact_source_url, contact.verification_status,
         contact.verification_reason, contact.syntax_valid, contact.mx_status,
         contact.is_role_address, contact.is_free_mailbox, contact.domain_matches,
         contact.contact_quality_score,
         message.id AS message_id, message.subject AS message_subject,
         message.body_text AS message_body_text, message.body_html AS message_body_html,
         message.generation_status, message.evidence_validation_status,
         message.sent_at AS message_sent_at,
         EXISTS (
           SELECT 1 FROM outbound_suppressions suppression
            WHERE suppression.active=TRUE
              AND (suppression.expires_at IS NULL OR suppression.expires_at>NOW())
              AND ((suppression.scope='email' AND LOWER(suppression.normalized_value)=LOWER(contact.email_normalized))
                OR (suppression.scope IN ('company_domain','email_domain') AND LOWER(suppression.normalized_value)=LOWER(p.canonical_domain)))
         ) AS active_suppression
    FROM outbound_prospects p
    LEFT JOIN outbound_manual_lead_reviews review ON review.prospect_id=p.id
    LEFT JOIN LATERAL (
      SELECT c.* FROM outbound_contacts c
       WHERE c.prospect_id=p.id AND c.active=TRUE
       ORDER BY c.is_primary DESC, c.contact_quality_score DESC NULLS LAST
       LIMIT 1
    ) contact ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.* FROM outbound_messages m
       WHERE m.prospect_id=p.id AND m.message_kind='initial'
       ORDER BY m.created_at DESC
       LIMIT 1
    ) message ON TRUE`;

async function listManualReviewLeads(sql, { limit = 50, offset = 0, minimumScore = MIN_HIGH_VALUE_SCORE, reviewView = 'ready' } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const safeOffset = Math.max(0, Math.min(10000, Number(offset) || 0));
  const safeScore = Math.max(MIN_HIGH_VALUE_SCORE, Math.min(100, Number(minimumScore) || MIN_HIGH_VALUE_SCORE));
  const candidateWhere = `((p.lead_score >= $1 AND p.status IN ('qualified','ready_for_outreach')) OR review.prospect_id IS NOT NULL)`;
  const viewWhere = {
    ready: "COALESCE(review.send_state,'not_sent')<>'sent' AND COALESCE(review.review_status,'pending')<>'rejected'",
    pending: "COALESCE(review.review_status,'pending')='pending' AND COALESCE(review.send_state,'not_sent')<>'sent'",
    approved: "review.review_status='approved' AND review.send_state<>'sent'",
    rejected: "review.review_status='rejected' AND review.send_state<>'sent'",
    sent: "review.send_state='sent'",
    all: 'TRUE',
  }[reviewView] || "COALESCE(review.send_state,'not_sent')<>'sent' AND COALESCE(review.review_status,'pending')<>'rejected'";
  const [rows, countRows, dailyRows] = await Promise.all([
    sql(`${LEAD_SELECT} WHERE ${candidateWhere} AND (${viewWhere})
         ORDER BY CASE WHEN review.send_state='sent' THEN 3 WHEN review.review_status='approved' THEN 0 WHEN review.review_status='rejected' THEN 2 ELSE 1 END,
                  CASE
                    WHEN p.qualification_evidence::text ~* 'trade[ -]?show|conference|expo|exhibit|exhibitor' THEN 0
                    WHEN p.qualification_evidence::text ~* 'upcoming_events|event|festival|tournament|gala' THEN 1
                    ELSE 2
                  END,
                  p.lead_score DESC NULLS LAST, p.last_qualified_at DESC NULLS LAST, p.discovered_at DESC
         LIMIT $2 OFFSET $3`, [safeScore, safeLimit, safeOffset]),
    sql(`SELECT COUNT(*)::integer AS total
           FROM outbound_prospects p
           LEFT JOIN outbound_manual_lead_reviews review ON review.prospect_id=p.id
          WHERE ${candidateWhere} AND (${viewWhere})`, [safeScore]),
    sql(`SELECT manual_attempted_count,manual_sent_count
           FROM outbound_daily_delivery_counters WHERE business_date=CURRENT_DATE LIMIT 1`),
  ]);
  const leads = rows.map(mapLead);
  return {
    leads,
    total: Number(countRows[0]?.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    minimumScore: safeScore,
    reviewView: Object.hasOwn({ ready: true, pending: true, approved: true, rejected: true, sent: true, all: true }, reviewView) ? reviewView : 'ready',
    counts: leads.reduce((summary, lead) => {
      const key = lead.review.sendState === 'sent' ? 'sent' : lead.review.status;
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, { pending: 0, approved: 0, rejected: 0, sent: 0 }),
    today: {
      attempted: Number(dailyRows[0]?.manual_attempted_count) || 0,
      sent: Number(dailyRows[0]?.manual_sent_count) || 0,
      limit: MAX_MANUAL_DAILY_ATTEMPTS,
    },
  };
}

async function saveManualReview(sql, data) {
  const approved = data.reviewStatus === 'approved';
  const rows = await sql(
    `INSERT INTO outbound_manual_lead_reviews (
       prospect_id,review_status,permission_status,permission_evidence,
       review_notes,reviewed_by,reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       review_status=EXCLUDED.review_status,
       permission_status=EXCLUDED.permission_status,
       permission_evidence=EXCLUDED.permission_evidence,
       review_notes=EXCLUDED.review_notes,
       reviewed_by=EXCLUDED.reviewed_by,
       reviewed_at=NOW(),updated_at=NOW()
     WHERE outbound_manual_lead_reviews.send_state <> 'sent'
     RETURNING *`,
    [data.prospectId, data.reviewStatus, approved ? 'explicit_opt_in' : 'unknown',
      approved ? data.permissionEvidence : null, data.notes || null, data.reviewedBy],
  );
  return rows[0] || null;
}

async function authorizeManualSend(sql, { prospectId, reviewedBy }) {
  const rows = await sql(
    `INSERT INTO outbound_manual_lead_reviews (
       prospect_id,review_status,permission_status,permission_evidence,
       reviewed_by,reviewed_at
     ) VALUES ($1,'approved','admin_authorized',NULL,$2,NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       review_status='approved',permission_status='admin_authorized',permission_evidence=NULL,
       reviewed_by=EXCLUDED.reviewed_by,reviewed_at=NOW(),updated_at=NOW()
     WHERE outbound_manual_lead_reviews.send_state <> 'sent'
     RETURNING *`,
    [prospectId, reviewedBy],
  );
  return rows[0] || null;
}

async function loadManualReviewContact(sql, prospectId) {
  const rows = await sql(
    `SELECT c.id,c.email,p.canonical_domain
       FROM outbound_prospects p
       JOIN LATERAL (
         SELECT contact.* FROM outbound_contacts contact
          WHERE contact.prospect_id=p.id AND contact.active=TRUE
          ORDER BY contact.is_primary DESC,contact.contact_quality_score DESC NULLS LAST
          LIMIT 1
       ) c ON TRUE
      WHERE p.id=$1
      LIMIT 1`,
    [prospectId],
  );
  return rows[0] || null;
}

async function saveManualContactAssessment(sql, contactId, assessment) {
  const rows = await sql(
    `UPDATE outbound_contacts
        SET email=$2,email_normalized=COALESCE($3,email_normalized),syntax_valid=$4,is_role_address=$5,
            is_free_mailbox=$6,domain_matches=$7,mx_status=$8,mx_checked_at=$9,
            verification_status=$10,verification_reason=$11,
            contact_quality_score=$12,send_eligible=FALSE,updated_at=NOW()
      WHERE id=$1 AND active=TRUE
      RETURNING id,email,mx_status,verification_status`,
    [contactId, assessment.email, assessment.emailNormalized, assessment.syntaxValid,
      assessment.isRoleAddress, assessment.isFreeMailbox, assessment.domainMatches,
      assessment.mxStatus, assessment.mxCheckedAt, assessment.verificationStatus,
      assessment.verificationReason, assessment.contactQualityScore],
  );
  return rows[0] || null;
}

async function loadManualReviewState(sql, prospectId) {
  const rows = await sql(
    `SELECT prospect_id,review_status,permission_status,send_state,send_key,
            resend_message_id,last_send_error_code,sent_at
       FROM outbound_manual_lead_reviews WHERE prospect_id=$1 LIMIT 1`,
    [prospectId],
  );
  return rows[0] || null;
}

async function claimManualReviewSend(sql, data) {
  const dailyLimit = Math.max(1, Math.min(MAX_MANUAL_DAILY_ATTEMPTS, Number(data.dailyLimit) || MAX_MANUAL_DAILY_ATTEMPTS));
  const rows = await sql(
    `WITH candidate AS (
       SELECT review.prospect_id,contact.id AS contact_id,message.id AS message_id
         FROM outbound_manual_lead_reviews review
         JOIN outbound_prospects p ON p.id=review.prospect_id
         JOIN LATERAL (
           SELECT c.* FROM outbound_contacts c
            WHERE c.prospect_id=p.id AND c.active=TRUE
            ORDER BY c.is_primary DESC,c.contact_quality_score DESC NULLS LAST LIMIT 1
         ) contact ON TRUE
         JOIN LATERAL (
           SELECT m.* FROM outbound_messages m
            WHERE m.prospect_id=p.id AND m.message_kind='initial'
            ORDER BY m.created_at DESC LIMIT 1
         ) message ON TRUE
        WHERE review.prospect_id=$1
          AND review.review_status='approved' AND review.permission_status IN ('explicit_opt_in','admin_authorized')
          AND review.send_state IN ('not_sent','failed') AND review.send_attempt_count<3
          AND p.status IN ('qualified','ready_for_outreach')
          AND p.first_contacted_at IS NULL AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL
          AND contact.syntax_valid=TRUE AND contact.mx_status='present'
          AND contact.is_role_address=FALSE AND contact.is_free_mailbox=FALSE AND contact.domain_matches=TRUE
          AND message.generation_status='generated' AND message.evidence_validation_status='passed'
          AND message.status='draft' AND message.subject IS NOT NULL AND message.body_text IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM outbound_suppressions suppression
             WHERE suppression.active=TRUE AND (suppression.expires_at IS NULL OR suppression.expires_at>NOW())
               AND ((suppression.scope='email' AND LOWER(suppression.normalized_value)=LOWER(contact.email_normalized))
                 OR (suppression.scope IN ('company_domain','email_domain') AND LOWER(suppression.normalized_value)=LOWER(p.canonical_domain)))
          )
     ), counter AS (
       INSERT INTO outbound_daily_delivery_counters (business_date,manual_attempted_count)
       SELECT $2,1 FROM candidate
       ON CONFLICT (business_date) DO UPDATE
         SET manual_attempted_count=outbound_daily_delivery_counters.manual_attempted_count+1,updated_at=NOW()
         WHERE outbound_daily_delivery_counters.manual_attempted_count<$3
       RETURNING business_date
     )
     UPDATE outbound_manual_lead_reviews review
        SET send_state='processing',send_key=COALESCE(review.send_key,$4),
            send_attempt_count=review.send_attempt_count+1,send_started_at=NOW(),
            last_send_error_code=NULL,updated_at=NOW()
       FROM candidate,counter,outbound_prospects p,outbound_contacts contact,outbound_messages message
      WHERE review.prospect_id=candidate.prospect_id
        AND p.id=candidate.prospect_id AND contact.id=candidate.contact_id AND message.id=candidate.message_id
        AND review.send_state IN ('not_sent','failed')
      RETURNING review.prospect_id,review.send_key,review.send_attempt_count,
                p.business_name,p.status AS prospect_status,
                contact.id AS contact_id,contact.email,
                message.id AS message_id,message.campaign_id,message.subject,
                message.body_text,message.generation_status,message.evidence_validation_status`,
    [data.prospectId, data.businessDate, dailyLimit, data.sendKey],
  );
  return rows[0] || null;
}

async function markManualReviewSent(sql, data) {
  const rows = await sql(
    `WITH review_update AS (
       UPDATE outbound_manual_lead_reviews
          SET send_state='sent',resend_message_id=$3,last_send_error_code=NULL,
              sent_at=NOW(),updated_at=NOW()
        WHERE prospect_id=$1 AND send_key=$2 AND send_state='processing'
       RETURNING prospect_id
     ), message_update AS (
       UPDATE outbound_messages message
          SET status='sent',delivery_state='sent',send_key=COALESCE(message.send_key,$2),
              resend_message_id=$3,sent_at=NOW(),last_send_latency_ms=$4,
              last_send_error_code=NULL,updated_at=NOW()
         FROM review_update review
        WHERE message.id=$5 AND message.prospect_id=review.prospect_id AND message.status='draft'
       RETURNING message.id,message.prospect_id
     ), prospect_update AS (
       UPDATE outbound_prospects prospect
          SET status='contacted',first_contacted_at=COALESCE(first_contacted_at,NOW()),updated_at=NOW()
         FROM message_update message WHERE prospect.id=message.prospect_id RETURNING prospect.id
     ), counter_update AS (
       UPDATE outbound_daily_delivery_counters
          SET manual_sent_count=manual_sent_count+1,sent_count=sent_count+1,updated_at=NOW()
        WHERE business_date=$6 AND EXISTS (SELECT 1 FROM message_update) RETURNING business_date
     ), event_insert AS (
       INSERT INTO outbound_email_events (message_id,provider_event_id,event_type,event_status,event_summary,event_at)
       SELECT id,$7,'sent','accepted',$8::jsonb,NOW() FROM message_update
       ON CONFLICT (provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING RETURNING id
     ) SELECT id,prospect_id FROM message_update`,
    [data.prospectId, data.sendKey, data.providerMessageId, data.latencyMs, data.messageId,
      data.businessDate, `manual-send:${data.messageId}`,
      JSON.stringify(sanitizeForAudit({ provider: 'resend', permissionBasis: 'admin_authorized', latencyMs: data.latencyMs }))],
  );
  return rows[0] || null;
}

async function markManualReviewFailed(sql, data) {
  const rows = await sql(
    `UPDATE outbound_manual_lead_reviews
        SET send_state='failed',last_send_error_code=$3,updated_at=NOW()
      WHERE prospect_id=$1 AND send_key=$2 AND send_state='processing'
      RETURNING prospect_id,send_attempt_count`,
    [data.prospectId, data.sendKey, String(data.errorCode || 'MANUAL_MARKETING_SEND_FAILED').slice(0, 100)],
  );
  return rows[0] || null;
}

module.exports = {
  MIN_HIGH_VALUE_SCORE,
  MAX_MANUAL_DAILY_ATTEMPTS,
  technicalBlockers,
  mapLead,
  listManualReviewLeads,
  saveManualReview,
  authorizeManualSend,
  loadManualReviewContact,
  saveManualContactAssessment,
  loadManualReviewState,
  claimManualReviewSend,
  markManualReviewSent,
  markManualReviewFailed,
};
