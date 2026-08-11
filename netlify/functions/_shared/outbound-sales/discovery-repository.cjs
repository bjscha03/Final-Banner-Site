'use strict';

const { sanitizeForAudit } = require('./security.cjs');

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

async function findDuplicateProspect(sql, prospect) {
  const rows = await sql(
    `SELECT DISTINCT p.*,
            CASE
              WHEN p.source_provider_id = $1 AND p.source_record_id = $2 THEN 'provider_id'
              WHEN sources.provider_id = $1 AND sources.provider_record_id = $2 THEN 'provider_id'
              WHEN $3::text IS NOT NULL AND LOWER(p.canonical_domain) = $3 THEN 'canonical_domain'
              WHEN $4::text IS NOT NULL AND p.dedupe_fingerprint = $4 THEN 'fingerprint'
              ELSE 'existing'
            END AS duplicate_match
       FROM outbound_prospects p
       LEFT JOIN outbound_prospect_sources sources ON sources.prospect_id = p.id
      WHERE (
        ($2::text IS NOT NULL AND p.source_provider_id = $1 AND p.source_record_id = $2)
        OR ($2::text IS NOT NULL AND sources.provider_id = $1 AND sources.provider_record_id = $2)
        OR ($3::text IS NOT NULL AND LOWER(p.canonical_domain) = $3)
        OR ($4::text IS NOT NULL AND p.dedupe_fingerprint = $4)
      )
      ORDER BY CASE
        WHEN p.source_provider_id = $1 AND p.source_record_id = $2 THEN 1
        WHEN sources.provider_id = $1 AND sources.provider_record_id = $2 THEN 2
        WHEN $3::text IS NOT NULL AND LOWER(p.canonical_domain) = $3 THEN 3
        ELSE 4
      END
      LIMIT 1`,
    [prospect.providerId, prospect.providerRecordId, prospect.canonicalDomain, prospect.dedupeFingerprint],
  );
  return rows[0] || null;
}

async function attachProspectSource(sql, prospectId, prospect) {
  if (!prospect.providerRecordId) return { prospect_id: prospectId };
  const rows = await sql(
    `INSERT INTO outbound_prospect_sources (
       prospect_id, provider_id, provider_record_id, source_url, provider_metadata
     ) VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (provider_id, provider_record_id) DO UPDATE
       SET last_seen_at = NOW(),
           source_url = COALESCE(EXCLUDED.source_url, outbound_prospect_sources.source_url),
           provider_metadata = outbound_prospect_sources.provider_metadata || EXCLUDED.provider_metadata
     RETURNING prospect_id, first_seen_at, last_seen_at`,
    [prospectId, prospect.providerId, prospect.providerRecordId, prospect.sourceUrl, jsonValue(prospect.providerMetadata || {})],
  );
  return rows[0] || null;
}

async function storeNormalizedProspect(sql, prospect) {
  let existing = await findDuplicateProspect(sql, prospect);
  if (existing) {
    await sql(
      `UPDATE outbound_prospects
          SET website_url = COALESCE(website_url, $2),
              canonical_domain = COALESCE(canonical_domain, $3),
              phone = COALESCE(phone, $4),
              industry = COALESCE(industry, $5),
              business_type = COALESCE(business_type, $6),
              location_count = CASE
                WHEN location_count IS NULL AND $7::integer IS NULL THEN NULL
                ELSE GREATEST(COALESCE(location_count, 0), COALESCE($7, 0))
              END,
              provider_metadata = provider_metadata || $8::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [existing.id, prospect.websiteUrl, prospect.canonicalDomain, prospect.phone, prospect.industry,
        prospect.businessType, prospect.locationCount, jsonValue(prospect.providerMetadata || {})],
    );
    const source = await attachProspectSource(sql, existing.id, prospect);
    if (source?.prospect_id && source.prospect_id !== existing.id) {
      existing = await findDuplicateProspect(sql, prospect);
    }
    return { prospect: existing, created: false, duplicateMatch: existing?.duplicate_match || 'existing' };
  }

  const rows = await sql(
    `INSERT INTO outbound_prospects (
       source_provider_id, source_record_id, source_url, business_name, normalized_business_name,
       dedupe_fingerprint, website_url, canonical_domain, phone, industry, business_type,
       location_count, address, provider_metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      prospect.providerId, prospect.providerRecordId, prospect.sourceUrl, prospect.businessName,
      prospect.normalizedBusinessName, prospect.dedupeFingerprint, prospect.websiteUrl,
      prospect.canonicalDomain, prospect.phone, prospect.industry, prospect.businessType,
      prospect.locationCount, jsonValue(prospect.address || {}), jsonValue(prospect.providerMetadata || {}),
    ],
  );
  if (!rows[0]) {
    existing = await findDuplicateProspect(sql, prospect);
    if (!existing) {
      const error = new Error('A concurrent prospect insert could not be resolved safely.');
      error.code = 'PROSPECT_DEDUPE_CONFLICT';
      throw error;
    }
    await attachProspectSource(sql, existing.id, prospect);
    return { prospect: existing, created: false, duplicateMatch: existing.duplicate_match || 'existing' };
  }
  const source = await attachProspectSource(sql, rows[0].id, prospect);
  if (source?.prospect_id && source.prospect_id !== rows[0].id) {
    await sql(
      `DELETE FROM outbound_prospects
        WHERE id = $1 AND status = 'discovered'
          AND NOT EXISTS (SELECT 1 FROM outbound_prospect_sources s WHERE s.prospect_id = $1)`,
      [rows[0].id],
    );
    existing = await findDuplicateProspect(sql, prospect);
    if (!existing) {
      const error = new Error('Provider record was concurrently assigned but could not be resolved safely.');
      error.code = 'PROSPECT_PROVIDER_ID_CONFLICT';
      throw error;
    }
    return { prospect: existing, created: false, duplicateMatch: 'provider_id' };
  }
  return { prospect: rows[0], created: true, duplicateMatch: null };
}

async function loadLatestResearch(sql, prospectId) {
  const rows = await sql(
    `SELECT content_hash, extraction_version, page_manifest, source_urls,
            extracted_facts, evidence, banner_need_signals, website_freshness_score,
            final_url, http_etag, http_last_modified, fetched_at
       FROM outbound_research_snapshots
      WHERE prospect_id = $1
      ORDER BY fetched_at DESC
      LIMIT 1`,
    [prospectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    contentHash: row.content_hash,
    extractionVersion: row.extraction_version,
    pageManifest: row.page_manifest || [],
    sourceUrls: row.source_urls || [],
    extractedFacts: row.extracted_facts || {},
    evidence: row.evidence || [],
    bannerNeedSignals: row.banner_need_signals || [],
    websiteFreshnessScore: Number(row.website_freshness_score) || 0,
    finalUrl: row.final_url,
    httpEtag: row.http_etag,
    httpLastModified: row.http_last_modified,
    fetchedAt: row.fetched_at,
  };
}

async function saveResearch(sql, prospectId, research) {
  const rows = await sql(
    `INSERT INTO outbound_research_snapshots (
       prospect_id, content_hash, website_url, source_urls, extracted_facts, evidence,
       banner_need_signals, website_freshness_score, final_url, http_status, content_type,
       content_bytes, http_etag, http_last_modified, extraction_version, cache_status, page_manifest
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17::jsonb
     )
     ON CONFLICT (prospect_id, content_hash) DO UPDATE
       SET fetched_at = NOW(),
           source_urls = EXCLUDED.source_urls,
           extracted_facts = EXCLUDED.extracted_facts,
           evidence = EXCLUDED.evidence,
           banner_need_signals = EXCLUDED.banner_need_signals,
           website_freshness_score = EXCLUDED.website_freshness_score,
           final_url = EXCLUDED.final_url,
           http_status = EXCLUDED.http_status,
           content_type = EXCLUDED.content_type,
           content_bytes = EXCLUDED.content_bytes,
           http_etag = EXCLUDED.http_etag,
           http_last_modified = EXCLUDED.http_last_modified,
           extraction_version = EXCLUDED.extraction_version,
           cache_status = EXCLUDED.cache_status,
           page_manifest = EXCLUDED.page_manifest
     RETURNING id, content_hash, cache_status, fetched_at`,
    [
      prospectId, research.contentHash, research.websiteUrl, jsonValue(research.sourceUrls),
      jsonValue(research.extractedFacts), jsonValue(research.evidence), jsonValue(research.bannerNeedSignals),
      research.websiteFreshnessScore, research.finalUrl, research.httpStatus, research.contentType,
      research.contentBytes, research.httpEtag, research.httpLastModified, research.extractionVersion,
      research.cacheStatus, jsonValue(research.pageManifest),
    ],
  );
  await sql(
    `UPDATE outbound_prospects
        SET website_content_hash = $2, last_researched_at = NOW(),
            research_state = CASE WHEN $3 = 'reused' THEN 'unchanged' ELSE 'fetched' END,
            personalization_state = CASE
              WHEN personalization_content_hash IS NOT NULL
               AND personalization_content_hash IS DISTINCT FROM $2 THEN 'stale'
              ELSE personalization_state
            END,
            updated_at = NOW()
      WHERE id = $1`,
    [prospectId, research.contentHash, research.cacheStatus],
  );
  return rows[0] || null;
}

async function markResearchFailure(sql, prospectId, errorCode) {
  const state = String(errorCode || '').includes('BLOCKED') ? 'blocked' : 'failed';
  await sql(
    `UPDATE outbound_prospects
        SET research_state = $2, rejection_reason = $3, updated_at = NOW()
      WHERE id = $1`,
    [prospectId, state, String(errorCode || 'WEBSITE_RESEARCH_FAILED').slice(0, 200)],
  );
}

async function storeContacts(sql, prospectId, contacts) {
  await sql(
    `UPDATE outbound_contacts
        SET active = FALSE, is_primary = FALSE, updated_at = NOW()
      WHERE prospect_id = $1 AND (active = TRUE OR is_primary = TRUE)`,
    [prospectId],
  );
  for (const contact of contacts || []) {
    if (!contact.emailNormalized) continue;
    await sql(
      `INSERT INTO outbound_contacts (
         prospect_id, full_name, job_title, email, email_normalized, is_primary, contact_quality_score,
         verification_status, verification_provider_id, verification_reason, verified_at, source_url, syntax_valid,
         is_role_address, is_free_mailbox, domain_matches, active, last_seen_at,
         mx_status, mx_checked_at, send_eligible
       ) VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE, NOW(), $16, $17, FALSE)
       ON CONFLICT (LOWER(email_normalized)) DO UPDATE
         SET email = EXCLUDED.email,
             full_name = COALESCE(EXCLUDED.full_name, outbound_contacts.full_name),
             job_title = COALESCE(EXCLUDED.job_title, outbound_contacts.job_title),
             source_url = COALESCE(EXCLUDED.source_url, outbound_contacts.source_url),
             contact_quality_score = EXCLUDED.contact_quality_score,
             verification_status = EXCLUDED.verification_status,
             verification_provider_id = COALESCE(EXCLUDED.verification_provider_id, outbound_contacts.verification_provider_id),
             verification_reason = EXCLUDED.verification_reason,
             verified_at = COALESCE(EXCLUDED.verified_at, outbound_contacts.verified_at),
             syntax_valid = EXCLUDED.syntax_valid,
             is_role_address = EXCLUDED.is_role_address,
             is_free_mailbox = EXCLUDED.is_free_mailbox,
             domain_matches = EXCLUDED.domain_matches,
             active = TRUE,
             last_seen_at = NOW(),
             mx_status = EXCLUDED.mx_status,
             mx_checked_at = EXCLUDED.mx_checked_at,
             send_eligible = FALSE,
             updated_at = NOW()
       WHERE outbound_contacts.prospect_id = EXCLUDED.prospect_id`,
      [
        prospectId, contact.fullName || null, contact.jobTitle || null,
        contact.email, contact.emailNormalized, contact.contactQualityScore,
        contact.verificationStatus, contact.verificationProviderId || null,
        contact.verificationReason, contact.verifiedAt || null, contact.sourceUrl,
        contact.syntaxValid, contact.isRoleAddress, contact.isFreeMailbox, contact.domainMatches,
        contact.mxStatus, contact.mxCheckedAt,
      ],
    );
  }
  const rows = await sql(
    `SELECT id, email, email_normalized, full_name, job_title, source_url, syntax_valid, is_role_address,
            is_free_mailbox, domain_matches, mx_status, mx_checked_at, verification_status,
            verification_reason, contact_quality_score, send_eligible
       FROM outbound_contacts
      WHERE prospect_id = $1 AND active = TRUE
      ORDER BY contact_quality_score DESC NULLS LAST, email_normalized`,
    [prospectId],
  );
  if (rows[0]) {
    await sql(
      `UPDATE outbound_contacts
          SET is_primary = (id = $2), updated_at = NOW()
        WHERE prospect_id = $1 AND is_primary IS DISTINCT FROM (id = $2)`,
      [prospectId, rows[0].id],
    );
  }
  await sql(
    `UPDATE outbound_prospects
        SET contact_state = CASE
          WHEN EXISTS (SELECT 1 FROM outbound_contacts c WHERE c.prospect_id = $1 AND c.active AND c.mx_status = 'present' AND NOT c.is_role_address) THEN 'found'
          WHEN EXISTS (SELECT 1 FROM outbound_contacts c WHERE c.prospect_id = $1 AND c.active AND c.is_role_address) THEN 'role_only'
          WHEN EXISTS (SELECT 1 FROM outbound_contacts c WHERE c.prospect_id = $1 AND c.active AND c.mx_status = 'temporary_error') THEN 'dns_unknown'
          WHEN EXISTS (SELECT 1 FROM outbound_contacts c WHERE c.prospect_id = $1 AND c.active) THEN 'invalid'
          ELSE 'none'
        END,
        updated_at = NOW()
      WHERE id = $1`,
    [prospectId],
  );
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name || null,
    jobTitle: row.job_title || null,
    email: row.email,
    emailNormalized: row.email_normalized,
    sourceUrl: row.source_url,
    syntaxValid: row.syntax_valid,
    isRoleAddress: row.is_role_address,
    isFreeMailbox: row.is_free_mailbox,
    domainMatches: row.domain_matches,
    mxStatus: row.mx_status,
    mxCheckedAt: row.mx_checked_at,
    verificationStatus: row.verification_status,
    verificationReason: row.verification_reason,
    contactQualityScore: Number(row.contact_quality_score) || 0,
    sendEligible: false,
  }));
}

async function saveQualification(sql, prospectId, qualification) {
  const rejectionReason = qualification.rejectionReasons?.length ? qualification.rejectionReasons.join(', ') : null;
  const rows = await sql(
    `UPDATE outbound_prospects
        SET status = $2,
            lead_score = $3,
            score_breakdown = $4::jsonb,
            score_explanation = $5::jsonb,
            qualification_evidence = $6::jsonb,
            rejection_reason = $7,
            suppression_reason = $8,
            prior_customer_match = $9,
            exclusion_codes = $10::jsonb,
            qualification_version = $11,
            last_qualified_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      prospectId, qualification.status, qualification.score, jsonValue(qualification.breakdown),
      jsonValue(qualification.explanations), jsonValue(qualification.evidence), rejectionReason,
      qualification.suppressionReason, qualification.exclusionCodes?.includes('EXISTING_CUSTOMER') || false,
      jsonValue(qualification.exclusionCodes || []), qualification.qualificationVersion,
    ],
  );
  return rows[0] || null;
}

async function recordProviderUsage(sql, usage) {
  const rows = await sql(
    `INSERT INTO outbound_provider_usage (
       provider_id, provider_kind, operation, prospect_id, job_id, cost_ledger_id,
       request_count, result_count, estimated_cost_microusd, actual_cost_microusd,
       status, request_key, provider_credits, rate_limit_remaining,
       rate_limit_reset_at, usage_metadata
     ) VALUES ($1, 'discovery', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
     ON CONFLICT (request_key) WHERE request_key IS NOT NULL DO UPDATE
       SET status = EXCLUDED.status,
           result_count = EXCLUDED.result_count,
           actual_cost_microusd = EXCLUDED.actual_cost_microusd,
           provider_credits = EXCLUDED.provider_credits,
           rate_limit_remaining = EXCLUDED.rate_limit_remaining,
           rate_limit_reset_at = EXCLUDED.rate_limit_reset_at,
           usage_metadata = outbound_provider_usage.usage_metadata || EXCLUDED.usage_metadata
     RETURNING id, status, estimated_cost_microusd, actual_cost_microusd, created_at`,
    [
      usage.providerId, usage.operation || 'organization_search', usage.prospectId || null,
      usage.jobId || null, usage.costLedgerId || null, usage.requestCount || 1,
      usage.resultCount || 0, usage.estimatedCostMicrousd || 0, usage.actualCostMicrousd ?? null,
      usage.status || 'completed', usage.requestKey || null, usage.providerCredits || 0,
      usage.rateLimitRemaining ?? null, usage.rateLimitResetAt || null, jsonValue(usage.metadata || {}),
    ],
  );
  return rows[0] || null;
}

async function loadProviderUsage(sql, requestKey) {
  if (!requestKey) return null;
  const rows = await sql(
    `SELECT id, provider_id, operation, request_count, result_count,
            estimated_cost_microusd, actual_cost_microusd, status, created_at
       FROM outbound_provider_usage
      WHERE request_key = $1
      LIMIT 1`,
    [requestKey],
  );
  return rows[0] || null;
}

function mapQueueProspect(row) {
  return {
    id: row.id,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    canonicalDomain: row.canonical_domain,
    industry: row.industry,
    businessType: row.business_type,
    locationCount: Number(row.location_count) || null,
    status: row.status,
    leadScore: row.lead_score === null ? null : Number(row.lead_score),
    scoreBreakdown: row.score_breakdown || {},
    scoreExplanation: row.score_explanation || [],
    qualificationEvidence: row.qualification_evidence || [],
    rejectionReason: row.rejection_reason,
    suppressionReason: row.suppression_reason,
    exclusionCodes: row.exclusion_codes || [],
    priorCustomerMatch: row.prior_customer_match === true,
    researchState: row.research_state,
    contactState: row.contact_state,
    sourceProviderId: row.source_provider_id,
    sourceUrls: row.source_urls || [],
    researchFacts: row.extracted_facts || {},
    researchCacheStatus: row.cache_status || null,
    websiteFreshnessScore: row.website_freshness_score === null ? null : Number(row.website_freshness_score),
    personalizationState: row.personalization_state || 'pending',
    personalizationFailureCode: row.personalization_failure_code || null,
    lastPersonalizedAt: row.last_personalized_at || null,
    messagePreview: row.message_id ? {
      id: row.message_id,
      generationStatus: row.generation_status,
      promptVersion: row.prompt_version,
      outputSchemaVersion: row.output_schema_version,
      researchContentHash: row.message_research_content_hash,
      model: row.message_model,
      subject: row.message_subject,
      bodyText: row.message_body_text,
      researchSummary: row.message_research_summary,
      personalizationEvidence: row.message_personalization_evidence || [],
      sourceUrls: row.message_source_urls || [],
      variantAssignments: row.message_variant_assignments || {},
      recommendedFollowUpAt: row.message_recommended_follow_up_at,
      estimatedOpenAICostMicrousd: Number(row.message_estimated_openai_cost_microusd) || 0,
      actualOpenAICostMicrousd: row.message_actual_openai_cost_microusd === null
        ? null
        : Number(row.message_actual_openai_cost_microusd) || 0,
      inputTokens: Number(row.message_input_tokens) || 0,
      cachedInputTokens: Number(row.message_cached_input_tokens) || 0,
      outputTokens: Number(row.message_output_tokens) || 0,
      evidenceValidationStatus: row.message_evidence_validation_status,
      generationErrorCode: row.message_generation_error_code,
      generatedAt: row.message_generated_at,
    } : null,
    primaryContact: row.contact_email ? {
      email: row.contact_email,
      sourceUrl: row.contact_source_url,
      syntaxValid: row.syntax_valid,
      verificationStatus: row.verification_status,
      verificationReason: row.verification_reason,
      mxStatus: row.mx_status,
      isRoleAddress: row.is_role_address,
      isFreeMailbox: row.is_free_mailbox,
      domainMatches: row.domain_matches,
      contactQualityScore: Number(row.contact_quality_score) || 0,
      sendEligible: false,
    } : null,
    discoveredAt: row.discovered_at,
    lastResearchedAt: row.last_researched_at,
    lastQualifiedAt: row.last_qualified_at,
  };
}

async function listShadowProspects(sql, { status = null, limit = 50, offset = 0, maximumLimit = 100 } = {}) {
  const safeMaximum = Math.max(1, Math.min(5000, Number(maximumLimit) || 100));
  const safeLimit = Math.max(1, Math.min(safeMaximum, Number(limit) || 50));
  const safeOffset = Math.max(0, Math.min(10000, Number(offset) || 0));
  const [rows, countRows, summaryRows, usageRows] = await Promise.all([
    sql(
      `SELECT p.*,
              research.source_urls, research.extracted_facts, research.cache_status,
              research.website_freshness_score,
              contact.email AS contact_email, contact.source_url AS contact_source_url,
              contact.syntax_valid, contact.verification_status, contact.verification_reason, contact.mx_status,
              contact.is_role_address, contact.is_free_mailbox, contact.domain_matches,
              contact.contact_quality_score,
              message.id AS message_id, message.generation_status, message.prompt_version,
              message.output_schema_version,
              message.research_content_hash AS message_research_content_hash,
              message.model AS message_model, message.subject AS message_subject,
              message.body_text AS message_body_text,
              message.research_summary AS message_research_summary,
              message.personalization_evidence AS message_personalization_evidence,
              message.source_urls AS message_source_urls,
              message.variant_assignments AS message_variant_assignments,
              message.recommended_follow_up_at AS message_recommended_follow_up_at,
              message.estimated_openai_cost_microusd AS message_estimated_openai_cost_microusd,
              message.actual_openai_cost_microusd AS message_actual_openai_cost_microusd,
              message.input_tokens AS message_input_tokens,
              message.cached_input_tokens AS message_cached_input_tokens,
              message.output_tokens AS message_output_tokens,
              message.evidence_validation_status AS message_evidence_validation_status,
              message.generation_error_code AS message_generation_error_code,
              message.generated_at AS message_generated_at
         FROM outbound_prospects p
         LEFT JOIN LATERAL (
           SELECT r.source_urls, r.extracted_facts, r.cache_status, r.website_freshness_score
             FROM outbound_research_snapshots r
            WHERE r.prospect_id = p.id
            ORDER BY r.fetched_at DESC
            LIMIT 1
         ) research ON TRUE
         LEFT JOIN LATERAL (
           SELECT c.email, c.source_url, c.syntax_valid, c.verification_status, c.verification_reason,
                  c.mx_status, c.is_role_address, c.is_free_mailbox, c.domain_matches,
                  c.contact_quality_score
             FROM outbound_contacts c
            WHERE c.prospect_id = p.id AND c.active = TRUE
            ORDER BY c.is_primary DESC, c.contact_quality_score DESC NULLS LAST
            LIMIT 1
         ) contact ON TRUE
         LEFT JOIN LATERAL (
           SELECT m.id, m.generation_status, m.prompt_version, m.output_schema_version,
                  m.research_content_hash, m.model, m.subject, m.body_text,
                  m.research_summary, m.personalization_evidence, m.source_urls,
                  m.variant_assignments, m.recommended_follow_up_at,
                  m.estimated_openai_cost_microusd, m.actual_openai_cost_microusd,
                  m.input_tokens, m.cached_input_tokens, m.output_tokens,
                  m.evidence_validation_status, m.generation_error_code, m.generated_at
             FROM outbound_messages m
            WHERE m.prospect_id = p.id AND m.message_kind = 'initial'
            ORDER BY m.created_at DESC
            LIMIT 1
         ) message ON TRUE
        WHERE ($1::text IS NULL OR p.status = $1)
        ORDER BY p.lead_score DESC NULLS LAST, p.last_qualified_at DESC NULLS LAST, p.discovered_at DESC
        LIMIT $2 OFFSET $3`,
      [status, safeLimit, safeOffset],
    ),
    sql(`SELECT COUNT(*)::integer AS total FROM outbound_prospects WHERE ($1::text IS NULL OR status = $1)`, [status]),
    sql(`SELECT status, COUNT(*)::integer AS count FROM outbound_prospects GROUP BY status ORDER BY status`),
    sql(
      `SELECT provider_id, operation,
              COALESCE(SUM(request_count), 0)::integer AS requests,
              COALESCE(SUM(result_count), 0)::integer AS results,
              COALESCE(SUM(provider_credits), 0)::numeric AS credits,
              COALESCE(SUM(COALESCE(actual_cost_microusd, estimated_cost_microusd)), 0)::bigint AS cost_microusd
         FROM outbound_provider_usage
        WHERE created_at >= date_trunc('month', NOW())
        GROUP BY provider_id, operation
        ORDER BY provider_id, operation`,
    ),
  ]);
  return {
    prospects: rows.map(mapQueueProspect),
    total: Number(countRows[0]?.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    statusCounts: Object.fromEntries(summaryRows.map((row) => [row.status, Number(row.count) || 0])),
    providerUsage: usageRows.map((row) => ({
      providerId: row.provider_id,
      operation: row.operation,
      requests: Number(row.requests) || 0,
      results: Number(row.results) || 0,
      credits: Number(row.credits) || 0,
      costMicrousd: Number(row.cost_microusd) || 0,
    })),
  };
}

module.exports = {
  findDuplicateProspect,
  attachProspectSource,
  storeNormalizedProspect,
  loadLatestResearch,
  saveResearch,
  markResearchFailure,
  storeContacts,
  saveQualification,
  recordProviderUsage,
  loadProviderUsage,
  listShadowProspects,
};
