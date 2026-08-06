'use strict';

const { sanitizeForAudit } = require('./security.cjs');

function integer(value) { return Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0; }

async function resolveReplyTarget(sql, fromEmail, inReplyToProviderMessageId = null, routedMessageId = null) {
  const rows = await sql(
    `SELECT p.id AS prospect_id, p.business_name, p.status AS prospect_status,
            c.id AS contact_id, m.id AS message_id, m.subject AS message_subject,
            m.campaign_id
       FROM outbound_contacts c
       JOIN outbound_prospects p ON p.id=c.prospect_id
       LEFT JOIN LATERAL (
         SELECT m.* FROM outbound_messages m
          WHERE m.prospect_id=p.id
            AND m.sent_at IS NOT NULL
            AND m.status IN ('sent','delivered','bounced','complained','suppressed')
            AND m.sent_at >= NOW()-INTERVAL '180 days'
            AND ($3::uuid IS NULL OR m.id=$3::uuid)
            AND ($3::uuid IS NOT NULL OR $2::text IS NULL OR m.resend_message_id=$2 OR m.delivery_metadata->>'internetMessageId'=$2)
          ORDER BY (m.id=$3::uuid) DESC NULLS LAST,
                   (m.resend_message_id=$2 OR m.delivery_metadata->>'internetMessageId'=$2) DESC NULLS LAST,
                   m.sent_at DESC, m.created_at DESC
          LIMIT 1
       ) m ON TRUE
      WHERE LOWER(c.email_normalized)=LOWER($1)
        AND m.id IS NOT NULL
      ORDER BY c.is_primary DESC
      LIMIT 1`,
    [fromEmail, inReplyToProviderMessageId, routedMessageId],
  );
  return rows[0] || null;
}

async function insertReply(sql, data) {
  const rows = await sql(
    `WITH inserted AS (
       INSERT INTO outbound_replies (
         prospect_id, message_id, provider_event_id, provider_message_id,
         in_reply_to_provider_message_id, from_email, to_email, subject,
         body_text, classification, classification_source,
         classification_confidence, classification_reason,
         deterministic_rule_version, raw_content_hash, headers_summary,
         suggested_response_subject, suggested_response_body,
         suggested_response_status, suggested_response_review_required,
         review_status, received_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$20,$11,$12::jsonb,
         $13,$14,$15::jsonb,$16,$17,$18,TRUE,'unreviewed',$19
       )
       ON CONFLICT (provider_event_id) DO NOTHING
       RETURNING *
     ), prospect_update AS (
       UPDATE outbound_prospects
          SET status=CASE
            WHEN $10='unsubscribe' THEN 'unsubscribed'
            WHEN status IN ('won','lost','unsubscribed','suppressed') THEN status
            WHEN $10='interested' THEN 'interested'
            WHEN $10='quote_request' THEN 'quote_requested'
            WHEN $10 IN ('not_interested','wrong_contact') THEN 'lost'
            ELSE 'replied' END,
              updated_at=NOW()
        WHERE id=$1 AND EXISTS (SELECT 1 FROM inserted)
       RETURNING id
     )
     SELECT * FROM inserted`,
    [
      data.prospectId, data.messageId || null, data.providerEventId,
      data.providerMessageId || null, data.inReplyToProviderMessageId || null,
      data.fromEmail, data.toEmail || null, data.subject || null,
      data.bodyText || null, data.classification, Number(data.confidence),
      JSON.stringify(sanitizeForAudit(data.reasons || [])), data.ruleVersion,
      data.rawContentHash, JSON.stringify(sanitizeForAudit(data.headersSummary || {})),
      data.suggestedResponse?.subject || null, data.suggestedResponse?.body || null,
      data.suggestedResponse?.status || 'not_requested', data.receivedAt,
      data.classificationSource || 'deterministic',
    ],
  );
  return rows[0] || null;
}

async function upsertReplySuppression(sql, data) {
  if (!['unsubscribe', 'wrong_contact'].includes(data.classification)) return null;
  const reason = data.classification === 'unsubscribe' ? 'unsubscribed' : 'wrong_contact';
  const rows = await sql(
    `INSERT INTO outbound_suppressions (
       scope, normalized_value, reason, source, prospect_id, contact_id,
       message_id, evidence, active, updated_at
     ) VALUES ('email', LOWER($1), $2, 'reply', $3, $4, $5, $6::jsonb, TRUE, NOW())
     ON CONFLICT (scope, normalized_value) DO UPDATE
       SET reason=EXCLUDED.reason, source='reply', prospect_id=EXCLUDED.prospect_id,
           contact_id=EXCLUDED.contact_id, message_id=EXCLUDED.message_id,
           evidence=EXCLUDED.evidence, active=TRUE, updated_at=NOW()
     RETURNING id`,
    [data.fromEmail, reason, data.prospectId, data.contactId, data.messageId || null,
      JSON.stringify({ replyId: data.replyId, classification: data.classification })],
  );
  return rows[0] || null;
}

async function listReplies(sql, { limit = 50, offset = 0, classification = null } = {}) {
  const safeLimit = Math.max(1, Math.min(5000, integer(limit) || 50));
  const safeOffset = Math.max(0, Math.min(10000, integer(offset)));
  const filter = classification ? String(classification) : null;
  const [rows, counts] = await Promise.all([
    sql(
      `SELECT r.id, r.prospect_id, r.message_id, p.business_name,
              r.from_email, r.to_email, r.subject, r.body_text,
              r.classification, r.classification_source,
              r.classification_confidence, r.classification_reason,
              r.suggested_response_subject, r.suggested_response_body,
              r.suggested_response_status, r.suggested_response_review_required,
              r.review_status, r.received_at, r.handled_at
         FROM outbound_replies r
         JOIN outbound_prospects p ON p.id=r.prospect_id
        WHERE ($3::text IS NULL OR r.classification=$3)
        ORDER BY r.received_at DESC
        LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset, filter],
    ),
    sql(`SELECT classification, COUNT(*)::int AS count FROM outbound_replies GROUP BY classification`),
  ]);
  return {
    replies: rows.map((row) => ({
      id: row.id, prospectId: row.prospect_id, messageId: row.message_id,
      businessName: row.business_name, fromEmail: row.from_email, toEmail: row.to_email,
      subject: row.subject, bodyText: row.body_text, classification: row.classification,
      classificationSource: row.classification_source,
      classificationConfidence: Number(row.classification_confidence) || 0,
      classificationReason: row.classification_reason || [],
      suggestedResponseSubject: row.suggested_response_subject,
      suggestedResponseBody: row.suggested_response_body,
      suggestedResponseStatus: row.suggested_response_status,
      suggestedResponseReviewRequired: row.suggested_response_review_required === true,
      reviewStatus: row.review_status, receivedAt: row.received_at, handledAt: row.handled_at,
    })),
    total: (counts || []).reduce((sum, row) => sum + integer(row.count), 0),
    classificationCounts: Object.fromEntries((counts || []).map((row) => [row.classification, integer(row.count)])),
    limit: safeLimit, offset: safeOffset,
  };
}

async function updateReplyReview(sql, data) {
  const rows = await sql(
    `UPDATE outbound_replies
        SET review_status=$2,
            classification=COALESCE($3, classification),
            classification_source=CASE WHEN $3 IS NULL THEN classification_source ELSE 'admin' END,
            handled_by=$4,
            handled_at=CASE WHEN $2 IN ('handled','ignored') THEN NOW() ELSE handled_at END,
            updated_at=NOW()
      WHERE id=$1
      RETURNING id, prospect_id, classification, review_status, handled_at`,
    [data.replyId, data.reviewStatus, data.classification || null, data.actorId || null],
  );
  return rows[0] || null;
}

async function recordReplyAIUsage(sql, data) {
  if (!data?.requestKey) return null;
  const status = data.status === 'completed' ? 'completed' : 'failed';
  const rows = await sql(
    `INSERT INTO outbound_ai_usage (
       prospect_id,reply_id,cost_ledger_id,request_key,model,input_tokens,
       cached_input_tokens,output_tokens,estimated_cost_microusd,
       actual_cost_microusd,provider_request_id,status,purpose,prompt_version,
       latency_ms,error_code,usage_metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'reply_classification',$13,$14,$15,$16::jsonb)
     ON CONFLICT (request_key) DO UPDATE
       SET reply_id=EXCLUDED.reply_id,cost_ledger_id=EXCLUDED.cost_ledger_id,
           input_tokens=EXCLUDED.input_tokens,cached_input_tokens=EXCLUDED.cached_input_tokens,
           output_tokens=EXCLUDED.output_tokens,actual_cost_microusd=EXCLUDED.actual_cost_microusd,
           provider_request_id=EXCLUDED.provider_request_id,status=EXCLUDED.status,
           latency_ms=EXCLUDED.latency_ms,error_code=EXCLUDED.error_code,
           usage_metadata=EXCLUDED.usage_metadata
     RETURNING id`,
    [
      data.prospectId, data.replyId || null, data.costLedgerId || null,
      data.requestKey, data.model, Number(data.inputTokens) || 0,
      Number(data.cachedInputTokens) || 0, Number(data.outputTokens) || 0,
      Number(data.estimatedCostMicrousd) || 0,
      data.actualCostMicrousd === null || data.actualCostMicrousd === undefined ? null : Number(data.actualCostMicrousd),
      data.providerRequestId || null, status, data.promptVersion || null,
      data.latencyMs ?? null, data.errorCode || null,
      JSON.stringify(sanitizeForAudit(data.metadata || {})),
    ],
  );
  return rows[0] || null;
}

module.exports = { resolveReplyTarget, insertReply, upsertReplySuppression, listReplies, updateReplyReview, recordReplyAIUsage };
