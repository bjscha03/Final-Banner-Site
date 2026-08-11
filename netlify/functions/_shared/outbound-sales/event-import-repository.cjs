'use strict';

const { sanitizeForAudit } = require('./security.cjs');
const { strictCompanyMockupReadySql } = require('./company-mockup-repository.cjs');

const STRICT_MOCKUP_READY_SQL = strictCompanyMockupReadySql({
  prospectId: 'p.id', status: 'mockup.status', renderVersion: 'mockup.render_version',
  contentHash: 'mockup.content_hash', blobKey: 'mockup.blob_key', logoUrl: 'mockup.logo_url',
  productImageUrl: 'mockup.product_image_url', qualityLevel: 'mockup.quality_level',
  messageId: 'mockup.message_id', expectedMessageId: 'm.id',
  expectedMessageContentHash: 'm.content_hash', generationMetadata: 'mockup.generation_metadata',
});

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

function eventBatchKey(eventKey) {
  const value = String(eventKey || '');
  if (!/^[a-z0-9][a-z0-9-]{4,79}$/.test(value)) {
    throw Object.assign(new Error('Event batch key is invalid.'), { code: 'EVENT_IMPORT_DATA_INVALID' });
  }
  return `event:${value}`;
}

async function ensureEventBatch(sql, {
  businessDate, eventKey, targetCount = 70, providerId = 'manual_event_research',
}) {
  const safeTarget = Math.max(1, Math.min(70, Number(targetCount) || 70));
  const safeEventKey = String(eventKey || '').slice(0, 80);
  const batchKey = eventBatchKey(safeEventKey);
  const rows = await sql(
    `INSERT INTO outbound_morning_batches (
       business_date,batch_key,target_count,status,source_provider_id,started_at,run_metadata
     ) VALUES ($1,$2,$3,'discovering',$4,NOW(),$5::jsonb)
     ON CONFLICT (business_date,batch_key) DO UPDATE SET
       target_count=EXCLUDED.target_count,source_provider_id=EXCLUDED.source_provider_id,
       started_at=COALESCE(outbound_morning_batches.started_at,NOW()),
       run_metadata=outbound_morning_batches.run_metadata || EXCLUDED.run_metadata,
       updated_at=NOW()
     WHERE outbound_morning_batches.batch_key=$2
       AND outbound_morning_batches.source_provider_id=$4
       AND outbound_morning_batches.run_metadata->>'eventKey'=$6
     RETURNING *`,
    [businessDate, batchKey, safeTarget, providerId, jsonValue({
      batchKey, eventKey: safeEventKey, manualSendingOnly: true, externalEmailsSent: 0,
    }), safeEventKey],
  );
  return rows[0] || null;
}

function mapEventCandidate(row) {
  return {
    prospect: {
      id: row.prospect_id,
      businessName: row.business_name,
      websiteUrl: row.website_url,
      canonicalDomain: row.canonical_domain,
      industry: row.industry,
      businessType: row.business_type,
      qualificationEvidence: row.qualification_evidence || [],
      leadScore: Number(row.lead_score) || 0,
    },
    contact: {
      id: row.contact_id,
      email: row.contact_email,
      fullName: row.contact_full_name || null,
      jobTitle: row.contact_job_title || null,
    },
    research: {
      contentHash: row.research_content_hash,
      sourceUrls: row.research_source_urls || [],
      extractedFacts: row.extracted_facts || {},
      evidence: row.research_evidence || [],
      bannerNeedSignals: row.banner_need_signals || [],
    },
  };
}

async function listExistingEventProspects(sql, { eventName, providerId = 'manual_event_research' }) {
  const rows = await sql(
    `SELECT p.*
       FROM outbound_prospects p
      WHERE p.first_contacted_at IS NULL
        AND p.prior_customer_match=FALSE
        AND p.suppression_reason IS NULL
        AND COALESCE(jsonb_array_length(p.exclusion_codes),0)=0
        AND (p.source_provider_id=$1 OR EXISTS (
          SELECT 1 FROM outbound_prospect_sources source
           WHERE source.prospect_id=p.id AND source.provider_id=$1
        ))
        AND p.qualification_evidence::text ILIKE $2
      ORDER BY p.lead_score DESC NULLS LAST,p.discovered_at DESC`,
    [providerId, `%${String(eventName || '').replace(/[%_]/g, '\\$&').slice(0, 120)}%`],
  );
  return rows;
}

async function loadMorningShard(sql, { batchId, shardKey }) {
  const rows = await sql(
    `SELECT id,status,discovered_count,new_prospect_count,last_error_code,updated_at
       FROM outbound_morning_batch_shards
      WHERE batch_id=$1 AND shard_key=$2
      LIMIT 1`,
    [batchId, String(shardKey || '').slice(0, 80)],
  );
  return rows[0] || null;
}

async function upsertEventContact(sql, { prospectId, contact }) {
  const rows = await sql(
    `INSERT INTO outbound_contacts (
       prospect_id,full_name,job_title,email,email_normalized,is_primary,contact_quality_score,
       verification_status,verification_provider_id,verification_reason,verified_at,source_url,
       syntax_valid,is_role_address,is_free_mailbox,domain_matches,active,last_seen_at,
       mx_status,mx_checked_at,send_eligible
     ) VALUES ($1,NULL,NULL,$2,$3,FALSE,$4,$5,NULL,$6,NULL,$7,$8,$9,$10,$11,TRUE,NOW(),$12,$13,FALSE)
     ON CONFLICT (LOWER(email_normalized)) DO UPDATE SET
       email=EXCLUDED.email,source_url=COALESCE(EXCLUDED.source_url,outbound_contacts.source_url),
       contact_quality_score=EXCLUDED.contact_quality_score,
       verification_status=EXCLUDED.verification_status,verification_reason=EXCLUDED.verification_reason,
       syntax_valid=EXCLUDED.syntax_valid,is_role_address=EXCLUDED.is_role_address,
       is_free_mailbox=EXCLUDED.is_free_mailbox,domain_matches=EXCLUDED.domain_matches,
       active=TRUE,last_seen_at=NOW(),mx_status=EXCLUDED.mx_status,
       mx_checked_at=EXCLUDED.mx_checked_at,send_eligible=FALSE,updated_at=NOW()
     WHERE outbound_contacts.prospect_id=EXCLUDED.prospect_id
     RETURNING id,email,email_normalized,full_name,job_title,source_url,syntax_valid,
               is_role_address,is_free_mailbox,domain_matches,mx_status,mx_checked_at,
               verification_status,verification_reason,contact_quality_score,send_eligible`,
    [prospectId, contact.email, contact.emailNormalized, contact.contactQualityScore,
      contact.verificationStatus, contact.verificationReason, contact.sourceUrl,
      contact.syntaxValid, contact.isRoleAddress, contact.isFreeMailbox, contact.domainMatches,
      contact.mxStatus, contact.mxCheckedAt],
  );
  await sql(
    `UPDATE outbound_contacts SET is_primary=TRUE,updated_at=NOW()
      WHERE id=$1 AND NOT EXISTS (
        SELECT 1 FROM outbound_contacts existing
         WHERE existing.prospect_id=$2 AND existing.active=TRUE AND existing.is_primary=TRUE
           AND existing.id<>$1
      )`,
    [rows[0]?.id || null, prospectId],
  );
  return rows[0] || null;
}

async function mergeEventProspectMetadata(sql, { prospectId, providerMetadata }) {
  const rows = await sql(
    `UPDATE outbound_prospects
        SET provider_metadata=provider_metadata || $2::jsonb,updated_at=NOW()
      WHERE id=$1
      RETURNING id,provider_metadata`,
    [prospectId, jsonValue(providerMetadata || {})],
  );
  return rows[0] || null;
}

async function listActiveProspectContacts(sql, prospectId) {
  const rows = await sql(
    `SELECT id,email,email_normalized,full_name,job_title,source_url,syntax_valid,
            is_role_address,is_free_mailbox,domain_matches,mx_status,mx_checked_at,
            verification_status,verification_reason,contact_quality_score,send_eligible
       FROM outbound_contacts
      WHERE prospect_id=$1 AND active=TRUE
      ORDER BY is_primary DESC,contact_quality_score DESC NULLS LAST,email_normalized`,
    [prospectId],
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    fullName: row.full_name || null,
    jobTitle: row.job_title || null,
    sourceUrl: row.source_url || null,
    syntaxValid: Boolean(row.syntax_valid),
    isRoleAddress: Boolean(row.is_role_address),
    isFreeMailbox: Boolean(row.is_free_mailbox),
    domainMatches: Boolean(row.domain_matches),
    mxStatus: row.mx_status,
    mxCheckedAt: row.mx_checked_at || null,
    verificationStatus: row.verification_status,
    verificationReason: row.verification_reason,
    contactQualityScore: Number(row.contact_quality_score) || 0,
    sendEligible: false,
  }));
}

async function recordEventProgress(sql, { batchId, status, lastErrorCode = null, metadata = {} }) {
  const safeStatus = ['discovering', 'preparing', 'ready', 'partial', 'failed'].includes(status)
    ? status
    : 'discovering';
  const rows = await sql(
    `UPDATE outbound_morning_batches
        SET status=CASE WHEN status='ready' THEN 'ready' ELSE $2 END,
            last_error_code=CASE WHEN status='ready' AND $2<>'ready' THEN last_error_code ELSE $3 END,
            run_metadata=CASE WHEN status='ready' AND $2<>'ready'
              THEN run_metadata ELSE run_metadata || $4::jsonb END,updated_at=NOW()
      WHERE id=$1
      RETURNING id,business_date,target_count,status,discovered_count,new_prospect_count,
                qualified_count,message_ready_count,mockup_ready_count,last_error_code,
                run_metadata,started_at,ready_at,updated_at`,
    [batchId, safeStatus, lastErrorCode, jsonValue(metadata)],
  );
  return rows[0] || null;
}

async function attachEventProspects(sql, {
  batchId, businessDate, eventKey, prospectIds = [],
}) {
  const uniqueIds = [...new Set(prospectIds.filter(Boolean))];
  const rows = uniqueIds.length ? await sql(
    `UPDATE outbound_prospects
        SET morning_batch_id=$1,imported_business_date=$2,
            morning_queue_position=NULL,morning_ready_at=NULL,updated_at=NOW()
      WHERE id=ANY($3::uuid[]) AND first_contacted_at IS NULL
        AND provider_metadata->>'eventKey'=$4
        AND (morning_batch_id IS NULL OR morning_batch_id=$1)
      RETURNING id`,
    [batchId, businessDate, uniqueIds, eventKey],
  ) : [];
  return rows.map((row) => row.id);
}

async function refreshEventImportCounts(sql, { batchId, eventKey }) {
  const rows = await sql(
    `UPDATE outbound_morning_batches batch SET
       discovered_count=COALESCE((
         SELECT SUM(shard.discovered_count)::integer
           FROM outbound_morning_batch_shards shard
          WHERE shard.batch_id=batch.id AND shard.status='succeeded'
            AND shard.shard_key LIKE 'event:%:import:%'
       ),0),
       new_prospect_count=(
         SELECT COUNT(*)::integer FROM outbound_prospects prospect
          WHERE prospect.morning_batch_id=batch.id
            AND prospect.provider_metadata->>'eventKey'=$2
       ),updated_at=NOW()
      WHERE batch.id=$1
      RETURNING id,discovered_count,new_prospect_count`,
    [batchId, eventKey],
  );
  return rows[0] || null;
}

async function loadEventBatchStatus(sql, { businessDate, eventKey }) {
  const batchKey = eventBatchKey(eventKey);
  const rows = await sql(
    `SELECT batch.id,batch.business_date,batch.target_count,batch.status,
            batch.discovered_count,batch.new_prospect_count,batch.qualified_count,
            batch.message_ready_count,batch.mockup_ready_count,batch.last_error_code,
            batch.run_metadata,batch.started_at,batch.ready_at,batch.updated_at,
            COUNT(shard.id)::integer AS import_shard_count,
            COUNT(shard.id) FILTER (WHERE shard.status='succeeded')::integer AS completed_import_shard_count,
            COUNT(shard.id) FILTER (WHERE shard.status='running')::integer AS running_import_shard_count,
            COUNT(shard.id) FILTER (WHERE shard.status='failed')::integer AS failed_import_shard_count
       FROM outbound_morning_batches batch
       LEFT JOIN outbound_morning_batch_shards shard ON shard.batch_id=batch.id
        AND shard.shard_key LIKE 'event:%:import:%'
      WHERE batch.business_date=$1 AND batch.batch_key=$2
        AND batch.run_metadata->>'eventKey'=$3
      GROUP BY batch.id
      LIMIT 1`,
    [businessDate, batchKey, eventKey],
  );
  return rows[0] || null;
}

async function listEventPreparationCandidates(sql, { batchId, eventKey, limit = 210 }) {
  const safeLimit = Math.max(1, Math.min(210, Number(limit) || 210));
  const rows = await sql(
    `SELECT p.id AS prospect_id,p.business_name,p.website_url,p.canonical_domain,
            p.industry,p.business_type,p.lead_score,p.qualification_evidence,
            contact.id AS contact_id,contact.email AS contact_email,
            contact.full_name AS contact_full_name,contact.job_title AS contact_job_title,
            research.content_hash AS research_content_hash,research.source_urls AS research_source_urls,
            research.extracted_facts,research.evidence AS research_evidence,research.banner_need_signals
       FROM outbound_prospects p
       JOIN LATERAL (
         SELECT c.* FROM outbound_contacts c
          WHERE c.prospect_id=p.id AND c.active=TRUE AND c.syntax_valid=TRUE
            AND c.mx_status='present' AND c.is_free_mailbox=FALSE
            AND c.domain_matches=TRUE
          ORDER BY c.is_primary DESC,c.is_role_address ASC,
                   c.verification_status='valid' DESC,c.contact_quality_score DESC NULLS LAST
          LIMIT 1
       ) contact ON TRUE
       JOIN LATERAL (
         SELECT r.content_hash,r.source_urls,r.extracted_facts,r.evidence,r.banner_need_signals
           FROM outbound_research_snapshots r WHERE r.prospect_id=p.id
          ORDER BY r.fetched_at DESC LIMIT 1
       ) research ON TRUE
      WHERE p.morning_batch_id=$1 AND p.provider_metadata->>'eventKey'=$3
        AND p.status IN ('qualified','ready_for_outreach')
        AND p.lead_score>=60 AND p.first_contacted_at IS NULL
        AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL
        AND COALESCE(jsonb_array_length(p.exclusion_codes),0)=0
        AND NOT EXISTS (
          SELECT 1 FROM outbound_suppressions s
           WHERE s.active=TRUE AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND ((s.scope='email' AND LOWER(s.normalized_value)=LOWER(contact.email_normalized))
               OR (s.scope IN ('company_domain','email_domain') AND LOWER(s.normalized_value)=LOWER(p.canonical_domain)))
        )
      ORDER BY COALESCE((p.provider_metadata->>'eventRank')::integer,2147483647),
               p.lead_score DESC,p.discovered_at DESC
      LIMIT $2`,
    [batchId, safeLimit, eventKey],
  );
  return rows.map(mapEventCandidate);
}

async function finalizeEventBatch(sql, {
  batchId, eventKey, targetCount = 70, lastErrorCode = null,
}) {
  const safeTarget = Math.max(1, Math.min(70, Number(targetCount) || 70));
  await sql(
    `UPDATE outbound_prospects
        SET morning_queue_position=NULL,morning_ready_at=NULL
      WHERE morning_batch_id=$1 AND provider_metadata->>'eventKey'=$2`,
    [batchId, eventKey],
  );
  const readyRows = await sql(
    `WITH ranked AS (
       SELECT p.id,ROW_NUMBER() OVER (ORDER BY
         COALESCE((p.provider_metadata->>'eventRank')::integer,2147483647),
         p.lead_score DESC,p.discovered_at DESC)::smallint AS queue_position
       FROM outbound_prospects p
       JOIN outbound_messages m ON m.prospect_id=p.id AND m.message_kind='initial'
         AND m.generation_status='generated' AND m.evidence_validation_status='passed' AND m.status='draft'
       JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
         AND (${STRICT_MOCKUP_READY_SQL})
       JOIN LATERAL (
         SELECT c.* FROM outbound_contacts c
          WHERE c.prospect_id=p.id AND c.active=TRUE AND c.syntax_valid=TRUE
            AND c.mx_status='present' AND c.is_free_mailbox=FALSE
            AND c.domain_matches=TRUE
          ORDER BY c.is_primary DESC,c.is_role_address ASC,c.contact_quality_score DESC NULLS LAST
          LIMIT 1
       ) contact ON TRUE
       WHERE p.morning_batch_id=$1 AND p.provider_metadata->>'eventKey'=$3
         AND m.contact_id=contact.id
         AND p.status IN ('qualified','ready_for_outreach')
         AND p.lead_score>=60 AND p.first_contacted_at IS NULL
         AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL
         AND COALESCE(jsonb_array_length(p.exclusion_codes),0)=0
         AND NOT EXISTS (
           SELECT 1 FROM outbound_suppressions s WHERE s.active=TRUE
             AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND ((s.scope='email' AND LOWER(s.normalized_value)=LOWER(contact.email_normalized))
               OR (s.scope IN ('company_domain','email_domain') AND LOWER(s.normalized_value)=LOWER(p.canonical_domain)))
         )
       ORDER BY COALESCE((p.provider_metadata->>'eventRank')::integer,2147483647),
                p.lead_score DESC,p.discovered_at DESC
       LIMIT $2
     )
     UPDATE outbound_prospects p SET morning_queue_position=ranked.queue_position,
            morning_ready_at=NOW(),updated_at=NOW()
       FROM ranked WHERE p.id=ranked.id
     RETURNING p.id,p.morning_queue_position`,
    [batchId, safeTarget, eventKey],
  );
  const countRows = await sql(
    `SELECT COUNT(*) FILTER (WHERE p.status IN ('qualified','ready_for_outreach'))::integer AS qualified_count,
            COUNT(*) FILTER (WHERE m.generation_status='generated' AND m.evidence_validation_status='passed')::integer AS message_ready_count,
            COUNT(*) FILTER (WHERE ${STRICT_MOCKUP_READY_SQL})::integer AS mockup_ready_count
       FROM outbound_prospects p
       LEFT JOIN outbound_messages m ON m.prospect_id=p.id AND m.message_kind='initial'
       LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
      WHERE p.morning_batch_id=$1 AND p.provider_metadata->>'eventKey'=$2`,
    [batchId, eventKey],
  );
  const counts = countRows[0] || {};
  const status = readyRows.length >= safeTarget ? 'ready' : readyRows.length > 0 ? 'partial' : 'failed';
  const batchRows = await sql(
    `UPDATE outbound_morning_batches SET status=$2,qualified_count=$3,message_ready_count=$4,
            mockup_ready_count=$5,ready_at=NOW(),last_error_code=$6,updated_at=NOW(),
            run_metadata=run_metadata || $7::jsonb
      WHERE id=$1 RETURNING *`,
    [batchId, status, Number(counts.qualified_count) || 0, Number(counts.message_ready_count) || 0,
      Number(counts.mockup_ready_count) || 0, lastErrorCode,
      JSON.stringify({ finalizedQueueOnly: true, externalEmailsSent: 0 })],
  );
  return { batch: batchRows[0] || null, readyCount: readyRows.length };
}

module.exports = {
  eventBatchKey,
  ensureEventBatch,
  mapEventCandidate,
  listExistingEventProspects,
  loadMorningShard,
  upsertEventContact,
  mergeEventProspectMetadata,
  listActiveProspectContacts,
  recordEventProgress,
  attachEventProspects,
  refreshEventImportCounts,
  loadEventBatchStatus,
  listEventPreparationCandidates,
  finalizeEventBatch,
};
