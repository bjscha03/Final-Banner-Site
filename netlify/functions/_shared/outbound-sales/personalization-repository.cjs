'use strict';

const { sanitizeForAudit } = require('./security.cjs');

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

function mapMessagePreview(row, prefix = '') {
  const get = (name) => row?.[`${prefix}${name}`];
  if (!get('message_id')) return null;
  return {
    id: get('message_id'),
    messageKind: get('message_kind') || 'initial',
    campaignId: get('campaign_id') || null,
    generationStatus: get('generation_status'),
    generationKey: get('generation_key'),
    promptVersion: get('prompt_version'),
    outputSchemaVersion: get('output_schema_version'),
    researchContentHash: get('message_research_content_hash'),
    model: get('model'),
    subject: get('subject'),
    bodyText: get('body_text'),
    bodyHtml: get('body_html'),
    researchSummary: get('research_summary'),
    personalizationEvidence: get('personalization_evidence') || [],
    sourceUrls: get('message_source_urls') || [],
    variantAssignments: get('variant_assignments') || {},
    recommendedFollowUpAt: get('recommended_follow_up_at'),
    estimatedOpenAICostMicrousd: Number(get('estimated_openai_cost_microusd')) || 0,
    actualOpenAICostMicrousd: get('actual_openai_cost_microusd') === null
      ? null
      : Number(get('actual_openai_cost_microusd')) || 0,
    inputTokens: Number(get('input_tokens')) || 0,
    cachedInputTokens: Number(get('cached_input_tokens')) || 0,
    outputTokens: Number(get('output_tokens')) || 0,
    evidenceValidationStatus: get('evidence_validation_status'),
    generationErrorCode: get('generation_error_code'),
    generationMetadata: get('generation_metadata') || {},
    contentHash: get('content_hash'),
    generatedAt: get('generated_at'),
    deliveryState: get('delivery_state') || 'not_planned',
    plannedSendAt: get('planned_send_at') || null,
    sendAttemptCount: Number(get('send_attempt_count')) || 0,
    resendMessageId: get('resend_message_id') || null,
    sentAt: get('sent_at') || null,
    deliveredAt: get('delivered_at') || null,
    createdAt: get('message_created_at'),
    updatedAt: get('message_updated_at'),
  };
}

async function loadPersonalizationCandidate(sql, prospectId) {
  const rows = await sql(
    `SELECT
       p.id AS prospect_id, p.source_provider_id, p.source_record_id,
       p.business_name, p.website_url, p.canonical_domain,
       p.industry, p.business_type, p.location_count, p.status AS prospect_status,
       p.lead_score, p.qualification_evidence, p.exclusion_codes,
       p.prior_customer_match, p.first_contacted_at, p.suppression_reason,
       p.rejection_reason, p.personalization_state, p.personalization_content_hash,
       p.personalization_failure_code, p.last_personalized_at,
       research.content_hash AS research_content_hash,
       research.source_urls AS research_source_urls,
       research.extracted_facts, research.evidence AS research_evidence,
       research.banner_need_signals, research.website_freshness_score,
       contact.id AS contact_id, contact.email AS contact_email,
       contact.syntax_valid, contact.verification_status, contact.mx_status,
       contact.is_role_address, contact.is_free_mailbox, contact.domain_matches,
       contact.contact_quality_score,
       message.id AS message_id, message.message_kind, message.campaign_id, message.generation_status, message.generation_key,
       message.prompt_version, message.output_schema_version,
       message.research_content_hash AS message_research_content_hash,
       message.model, message.subject, message.body_text, message.body_html,
       message.research_summary, message.personalization_evidence,
       message.source_urls AS message_source_urls, message.variant_assignments,
       message.recommended_follow_up_at, message.estimated_openai_cost_microusd,
       message.actual_openai_cost_microusd, message.input_tokens,
       message.cached_input_tokens, message.output_tokens,
       message.evidence_validation_status, message.generation_error_code,
       message.generation_metadata, message.content_hash, message.generated_at,
       message.delivery_state, message.planned_send_at, message.send_attempt_count,
       message.resend_message_id, message.sent_at, message.delivered_at,
       message.created_at AS message_created_at, message.updated_at AS message_updated_at
      FROM outbound_prospects p
      LEFT JOIN LATERAL (
        SELECT r.content_hash, r.source_urls, r.extracted_facts, r.evidence,
               r.banner_need_signals, r.website_freshness_score
          FROM outbound_research_snapshots r
         WHERE r.prospect_id = p.id
         ORDER BY r.fetched_at DESC
         LIMIT 1
      ) research ON TRUE
      LEFT JOIN LATERAL (
        SELECT c.id, c.email, c.syntax_valid, c.verification_status, c.mx_status,
               c.is_role_address, c.is_free_mailbox, c.domain_matches,
               c.contact_quality_score
          FROM outbound_contacts c
         WHERE c.prospect_id = p.id AND c.active = TRUE
         ORDER BY c.is_primary DESC, c.contact_quality_score DESC NULLS LAST
         LIMIT 1
      ) contact ON TRUE
      LEFT JOIN LATERAL (
        SELECT m.*
          FROM outbound_messages m
         WHERE m.prospect_id = p.id AND m.message_kind = 'initial'
         ORDER BY m.created_at DESC
         LIMIT 1
      ) message ON TRUE
     WHERE p.id = $1
     LIMIT 1`,
    [prospectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    prospect: {
      id: row.prospect_id,
      providerId: row.source_provider_id,
      providerRecordId: row.source_record_id,
      businessName: row.business_name,
      websiteUrl: row.website_url,
      canonicalDomain: row.canonical_domain,
      industry: row.industry,
      businessType: row.business_type,
      locationCount: row.location_count === null ? null : Number(row.location_count),
      status: row.prospect_status,
      leadScore: row.lead_score === null ? null : Number(row.lead_score),
      qualificationEvidence: row.qualification_evidence || [],
      exclusionCodes: row.exclusion_codes || [],
      priorCustomerMatch: row.prior_customer_match === true,
      firstContactedAt: row.first_contacted_at,
      suppressionReason: row.suppression_reason,
      rejectionReason: row.rejection_reason,
      personalizationState: row.personalization_state,
      personalizationContentHash: row.personalization_content_hash,
      personalizationFailureCode: row.personalization_failure_code,
      lastPersonalizedAt: row.last_personalized_at,
    },
    research: row.research_content_hash ? {
      contentHash: row.research_content_hash,
      sourceUrls: row.research_source_urls || [],
      extractedFacts: row.extracted_facts || {},
      evidence: row.research_evidence || [],
      bannerNeedSignals: row.banner_need_signals || [],
      websiteFreshnessScore: row.website_freshness_score === null ? null : Number(row.website_freshness_score),
    } : null,
    contact: row.contact_id ? {
      id: row.contact_id,
      email: row.contact_email,
      syntaxValid: row.syntax_valid === true,
      verificationStatus: row.verification_status,
      mxStatus: row.mx_status,
      isRoleAddress: row.is_role_address === true,
      isFreeMailbox: row.is_free_mailbox === true,
      domainMatches: row.domain_matches === true,
      contactQualityScore: Number(row.contact_quality_score) || 0,
      sendEligible: false,
    } : null,
    message: mapMessagePreview(row),
  };
}

async function claimPersonalization(sql, claim) {
  const rows = await sql(
    `WITH existing AS (
       SELECT id, generation_status, updated_at
         FROM outbound_messages
        WHERE prospect_id = $1 AND message_kind = 'initial'
        FOR UPDATE
     ), updated AS (
       UPDATE outbound_messages AS message
          SET contact_id = $2,
              campaign_id = $10,
              status = 'draft',
              generation_status = 'generating',
              generation_key = $3,
              prompt_version = $4,
              output_schema_version = $5,
              research_content_hash = $6,
              model = $7,
              variant_assignments = $8::jsonb,
              estimated_openai_cost_microusd = $9,
              generation_error_code = NULL,
              evidence_validation_status = 'pending',
              updated_at = NOW()
         FROM existing
        WHERE message.id = existing.id
          AND (existing.generation_status <> 'generating'
               OR existing.updated_at < NOW() - INTERVAL '10 minutes')
       RETURNING message.id, message.generation_status, message.generation_key
     ), inserted AS (
       INSERT INTO outbound_messages (
         prospect_id, contact_id, message_kind, status, generation_status,
         generation_key, prompt_version, output_schema_version,
         research_content_hash, model, variant_assignments,
         estimated_openai_cost_microusd, campaign_id
       )
       SELECT $1, $2, 'initial', 'draft', 'generating', $3, $4, $5, $6, $7, $8::jsonb, $9, $10
        WHERE NOT EXISTS (SELECT 1 FROM existing)
       ON CONFLICT DO NOTHING
       RETURNING id, generation_status, generation_key
     ), claimed AS (
       SELECT * FROM updated
       UNION ALL
       SELECT * FROM inserted
     ), prospect_update AS (
       UPDATE outbound_prospects
          SET personalization_state = 'generating',
              personalization_failure_code = NULL,
              updated_at = NOW()
        WHERE id = $1 AND EXISTS (SELECT 1 FROM claimed)
       RETURNING id
     )
     SELECT * FROM claimed
     LIMIT 1`,
    [
      claim.prospectId,
      claim.contactId || null,
      claim.generationKey,
      claim.promptVersion,
      claim.outputSchemaVersion,
      claim.researchContentHash,
      claim.model,
      jsonValue(claim.variantAssignments || {}),
      claim.estimatedCostMicrousd,
      claim.campaignId || null,
    ],
  );
  if (!rows[0]) {
    const error = new Error('A personalization request is already running for this prospect.');
    error.code = 'PERSONALIZATION_ALREADY_RUNNING';
    throw error;
  }
  return { id: rows[0].id, generationStatus: rows[0].generation_status, generationKey: rows[0].generation_key };
}

async function savePersonalizationSuccess(sql, data) {
  const rows = await sql(
    `WITH message_update AS (
       UPDATE outbound_messages
          SET status = 'draft',
              generation_status = 'generated',
              subject = $3,
              body_text = $4,
              body_html = $5,
              research_summary = $6,
              personalization_evidence = $7::jsonb,
              source_urls = $8::jsonb,
              variant_assignments = $9::jsonb,
              recommended_follow_up_at = $10,
              model = $11,
              input_tokens = $12,
              cached_input_tokens = $13,
              output_tokens = $14,
              actual_openai_cost_microusd = $15,
              content_hash = $16,
              evidence_validation_status = 'passed',
              generation_error_code = NULL,
              generation_metadata = $17::jsonb,
              generated_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND generation_key = $2 AND generation_status = 'generating'
       RETURNING *
     ), prospect_update AS (
       UPDATE outbound_prospects
          SET personalization_state = 'generated',
              personalization_content_hash = $18,
              personalization_failure_code = NULL,
              last_personalized_at = NOW(),
              updated_at = NOW()
        WHERE id = $19 AND EXISTS (SELECT 1 FROM message_update)
       RETURNING id
     ), usage_insert AS (
       INSERT INTO outbound_ai_usage (
         prospect_id, message_id, cost_ledger_id, request_key, model,
         input_tokens, cached_input_tokens, output_tokens,
         estimated_cost_microusd, actual_cost_microusd,
         provider_request_id, status, purpose, research_content_hash,
         prompt_version, latency_ms, usage_metadata
       )
       SELECT $19, message_update.id, $20, $2, $11, $12, $13, $14,
              $21, $15, $22, 'completed', 'personalized_outreach', $18,
              $23, $24, $17::jsonb
         FROM message_update
       ON CONFLICT (request_key) DO UPDATE
         SET input_tokens = EXCLUDED.input_tokens,
             cached_input_tokens = EXCLUDED.cached_input_tokens,
             output_tokens = EXCLUDED.output_tokens,
             actual_cost_microusd = EXCLUDED.actual_cost_microusd,
             provider_request_id = EXCLUDED.provider_request_id,
             status = 'completed',
             latency_ms = EXCLUDED.latency_ms,
             usage_metadata = EXCLUDED.usage_metadata
       RETURNING id
     )
     SELECT message_update.* FROM message_update`,
    [
      data.messageId,
      data.generationKey,
      data.subject,
      data.bodyText,
      data.bodyHtml,
      data.researchSummary,
      jsonValue(data.personalizationEvidence || []),
      jsonValue(data.sourceUrls || []),
      jsonValue(data.variantAssignments || {}),
      data.recommendedFollowUpAt,
      data.model,
      data.inputTokens,
      data.cachedInputTokens,
      data.outputTokens,
      data.actualCostMicrousd,
      data.contentHash,
      jsonValue(data.generationMetadata || {}),
      data.researchContentHash,
      data.prospectId,
      data.costLedgerId || null,
      data.estimatedCostMicrousd,
      data.providerRequestId || null,
      data.promptVersion,
      data.latencyMs,
    ],
  );
  return rows[0] || null;
}

async function savePersonalizationFailure(sql, data) {
  const errorCode = String(data.errorCode || 'PERSONALIZATION_FAILED').slice(0, 100);
  await sql(
    `WITH message_update AS (
       UPDATE outbound_messages
          SET generation_status = $3,
              generation_error_code = $4,
              evidence_validation_status = CASE WHEN $3 = 'blocked' THEN 'pending' ELSE 'failed' END,
              updated_at = NOW()
        WHERE id = $1 AND generation_key = $2
       RETURNING id
     ), prospect_update AS (
       UPDATE outbound_prospects
          SET personalization_state = $3,
              personalization_failure_code = $4,
              updated_at = NOW()
        WHERE id = $5 AND EXISTS (SELECT 1 FROM message_update)
       RETURNING id
     )
     INSERT INTO outbound_ai_usage (
       prospect_id, message_id, cost_ledger_id, request_key, model,
       estimated_cost_microusd, actual_cost_microusd, provider_request_id,
       status, purpose, research_content_hash, prompt_version, latency_ms,
       error_code, usage_metadata
     )
     SELECT $5, message_update.id, $6, $2, $7, $8, $9, $10,
            'failed', 'personalized_outreach', $11, $12, $13, $4, $14::jsonb
       FROM message_update
     ON CONFLICT (request_key) DO UPDATE
       SET status = 'failed', actual_cost_microusd = EXCLUDED.actual_cost_microusd,
           provider_request_id = EXCLUDED.provider_request_id,
           latency_ms = EXCLUDED.latency_ms, error_code = EXCLUDED.error_code,
           usage_metadata = EXCLUDED.usage_metadata`,
    [
      data.messageId,
      data.generationKey,
      data.blocked ? 'blocked' : 'failed',
      errorCode,
      data.prospectId,
      data.costLedgerId || null,
      data.model,
      data.estimatedCostMicrousd || 0,
      data.actualCostMicrousd ?? null,
      data.providerRequestId || null,
      data.researchContentHash || null,
      data.promptVersion || null,
      data.latencyMs ?? null,
      jsonValue(data.metadata || {}),
    ],
  );
}

async function listPersonalizationActivity(sql, { limit = 50, offset = 0, maximumLimit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(maximumLimit) || 100, Number(limit) || 50));
  const safeOffset = Math.max(0, Math.min(10000, Number(offset) || 0));
  const [rows, countRows, summaryRows] = await Promise.all([
    sql(
      `SELECT m.id AS message_id, m.message_kind, m.generation_status, m.generation_key,
              m.prompt_version, m.output_schema_version,
              m.research_content_hash AS message_research_content_hash,
              m.model, m.subject, m.body_text, m.body_html, m.research_summary,
              m.personalization_evidence, m.source_urls AS message_source_urls,
              m.variant_assignments, m.recommended_follow_up_at,
              m.estimated_openai_cost_microusd, m.actual_openai_cost_microusd,
              m.input_tokens, m.cached_input_tokens, m.output_tokens,
              m.evidence_validation_status, m.generation_error_code,
              m.generation_metadata, m.content_hash, m.generated_at,
              m.delivery_state, m.planned_send_at, m.send_attempt_count,
              m.resend_message_id, m.sent_at, m.delivered_at, m.campaign_id,
              m.created_at AS message_created_at, m.updated_at AS message_updated_at,
              p.id AS prospect_id, p.business_name, p.industry, p.lead_score,
              p.status AS prospect_status
         FROM outbound_messages m
         JOIN outbound_prospects p ON p.id = m.prospect_id
        WHERE m.message_kind IN ('initial','follow_up')
        ORDER BY m.generated_at DESC NULLS LAST, m.updated_at DESC
        LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset],
    ),
    sql(`SELECT COUNT(*)::integer AS total FROM outbound_messages WHERE message_kind IN ('initial','follow_up')`),
    sql(
      `SELECT
         COUNT(*) FILTER (WHERE generation_status = 'generated')::integer AS generated,
         COUNT(*) FILTER (WHERE generation_status = 'failed')::integer AS failed,
         COUNT(*) FILTER (WHERE generation_status = 'blocked')::integer AS blocked,
         COALESCE(SUM(actual_openai_cost_microusd) FILTER (WHERE generation_status = 'generated'), 0)::bigint AS actual_cost_microusd,
         COALESCE(AVG(actual_openai_cost_microusd) FILTER (WHERE generation_status = 'generated'), 0)::numeric AS average_cost_microusd,
         COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
         COALESCE(SUM(cached_input_tokens), 0)::bigint AS cached_input_tokens,
         COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens
       FROM outbound_messages
      WHERE message_kind IN ('initial','follow_up')
        AND created_at >= date_trunc('month', NOW())`,
    ),
  ]);
  const summary = summaryRows[0] || {};
  return {
    messages: rows.map((row) => ({
      prospectId: row.prospect_id,
      businessName: row.business_name,
      industry: row.industry,
      leadScore: row.lead_score === null ? null : Number(row.lead_score),
      prospectStatus: row.prospect_status,
      ...mapMessagePreview(row),
    })),
    total: Number(countRows[0]?.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    summary: {
      generated: Number(summary.generated) || 0,
      failed: Number(summary.failed) || 0,
      blocked: Number(summary.blocked) || 0,
      actualCostMicrousd: Number(summary.actual_cost_microusd) || 0,
      averageCostMicrousd: Number(summary.average_cost_microusd) || 0,
      inputTokens: Number(summary.input_tokens) || 0,
      cachedInputTokens: Number(summary.cached_input_tokens) || 0,
      outputTokens: Number(summary.output_tokens) || 0,
    },
  };
}

module.exports = {
  jsonValue,
  mapMessagePreview,
  loadPersonalizationCandidate,
  claimPersonalization,
  savePersonalizationSuccess,
  savePersonalizationFailure,
  listPersonalizationActivity,
};
