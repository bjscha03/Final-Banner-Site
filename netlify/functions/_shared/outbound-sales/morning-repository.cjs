'use strict';

const { sanitizeForAudit } = require('./security.cjs');

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

async function ensureMorningBatch(sql, { businessDate, targetCount = 70, providerId = 'apollo' }) {
  const safeTarget = Math.max(1, Math.min(70, Number(targetCount) || 70));
  const rows = await sql(
    `INSERT INTO outbound_morning_batches (
       business_date,target_count,status,source_provider_id,started_at,run_metadata
     ) VALUES ($1,$2,'discovering',$3,NOW(),$4::jsonb)
     ON CONFLICT (business_date) DO UPDATE SET
       target_count=EXCLUDED.target_count,
       source_provider_id=COALESCE(outbound_morning_batches.source_provider_id,EXCLUDED.source_provider_id),
       status=CASE WHEN outbound_morning_batches.status='ready' THEN 'ready' ELSE 'discovering' END,
       started_at=COALESCE(outbound_morning_batches.started_at,NOW()),updated_at=NOW()
     RETURNING *`,
    [businessDate, safeTarget, providerId, jsonValue({ manualSendingOnly: true, externalEmailsSent: 0 })],
  );
  return rows[0] || null;
}

async function reserveMorningProviderCredits(sql, { batchId, credits, dailyLimit }) {
  const safeCredits = Math.max(1, Number(credits) || 1);
  const safeLimit = Math.max(0, Number(dailyLimit) || 0);
  const rows = await sql(
    `UPDATE outbound_morning_batches
        SET provider_credits_reserved=provider_credits_reserved+$2,updated_at=NOW()
      WHERE id=$1 AND status IN ('discovering','partial')
        AND provider_credits_used+provider_credits_reserved+$2<=$3
      RETURNING id,provider_credits_reserved,provider_credits_used`,
    [batchId, safeCredits, safeLimit],
  );
  return rows[0] || null;
}

async function claimMorningShard(sql, { batchId, shardKey, requestKey }) {
  const rows = await sql(
    `INSERT INTO outbound_morning_batch_shards (
       batch_id,shard_key,status,provider_request_key,started_at
     ) VALUES ($1,$2,'running',$3,NOW())
     ON CONFLICT (batch_id,shard_key) DO UPDATE SET
       status='running',provider_request_key=EXCLUDED.provider_request_key,
       started_at=NOW(),completed_at=NULL,last_error_code=NULL,updated_at=NOW()
     WHERE outbound_morning_batch_shards.status='failed'
        OR (outbound_morning_batch_shards.status='running' AND outbound_morning_batch_shards.updated_at<NOW()-INTERVAL '30 minutes')
     RETURNING *`,
    [batchId, String(shardKey).slice(0, 80), String(requestKey).slice(0, 300)],
  );
  return rows[0] || null;
}

async function completeMorningShard(sql, {
  shardId, discoveredCount, newProspectCount, providerCreditsUsed,
}) {
  const rows = await sql(
    `UPDATE outbound_morning_batch_shards SET status='succeeded',discovered_count=$2,
            new_prospect_count=$3,provider_credits_used=$4,last_error_code=NULL,
            completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status='running' RETURNING *`,
    [shardId, Math.max(0, Number(discoveredCount) || 0), Math.max(0, Number(newProspectCount) || 0),
      Math.max(0, Number(providerCreditsUsed) || 0)],
  );
  return rows[0] || null;
}

async function failMorningShard(sql, { shardId, errorCode }) {
  const rows = await sql(
    `UPDATE outbound_morning_batch_shards SET status='failed',last_error_code=$2,
            completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status='running' RETURNING *`,
    [shardId, String(errorCode || 'MORNING_SHARD_FAILED').slice(0, 100)],
  );
  return rows[0] || null;
}

async function settleMorningProviderCredits(sql, {
  batchId, reservedCredits, usedCredits = 0, requestCount = 0,
}) {
  const rows = await sql(
    `UPDATE outbound_morning_batches
        SET provider_credits_reserved=GREATEST(0,provider_credits_reserved-$2),
            provider_credits_used=provider_credits_used+$3,
            provider_request_count=provider_request_count+$4,
            updated_at=NOW()
      WHERE id=$1
      RETURNING id,provider_credits_reserved,provider_credits_used,provider_request_count`,
    [batchId, Math.max(0, Number(reservedCredits) || 0), Math.max(0, Number(usedCredits) || 0), Math.max(0, Number(requestCount) || 0)],
  );
  return rows[0] || null;
}

async function attachMorningProspects(sql, {
  batchId, businessDate, prospectIds = [], discoveredCount = 0,
}) {
  const uniqueIds = [...new Set(prospectIds.filter(Boolean))];
  const rows = uniqueIds.length ? await sql(
    `UPDATE outbound_prospects
        SET morning_batch_id=$1,imported_business_date=$2,updated_at=NOW()
      WHERE id=ANY($3::uuid[])
        AND morning_batch_id IS NULL
        AND first_contacted_at IS NULL
      RETURNING id`,
    [batchId, businessDate, uniqueIds],
  ) : [];
  await sql(
    `UPDATE outbound_morning_batches
        SET discovered_count=discovered_count+$2,
            new_prospect_count=new_prospect_count+$3,
            updated_at=NOW()
      WHERE id=$1`,
    [batchId, Math.max(0, Number(discoveredCount) || 0), rows.length],
  );
  return rows.map((row) => row.id);
}

function mapPreparationCandidate(row) {
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

async function listMorningPreparationCandidates(sql, { batchId, limit = 70 }) {
  const safeLimit = Math.max(1, Math.min(70, Number(limit) || 70));
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
            AND c.mx_status='present' AND c.is_role_address=FALSE AND c.is_free_mailbox=FALSE
            AND c.domain_matches=TRUE
          ORDER BY c.is_primary DESC,c.verification_status='valid' DESC,c.contact_quality_score DESC NULLS LAST
          LIMIT 1
       ) contact ON TRUE
       JOIN LATERAL (
         SELECT r.content_hash,r.source_urls,r.extracted_facts,r.evidence,r.banner_need_signals
           FROM outbound_research_snapshots r WHERE r.prospect_id=p.id
          ORDER BY r.fetched_at DESC LIMIT 1
       ) research ON TRUE
      WHERE p.morning_batch_id=$1 AND p.status='ready_for_outreach' AND p.lead_score>=60
        AND p.first_contacted_at IS NULL AND p.prior_customer_match=FALSE
        AND p.suppression_reason IS NULL AND COALESCE(jsonb_array_length(p.exclusion_codes),0)=0
        AND NOT EXISTS (
          SELECT 1 FROM outbound_suppressions s
           WHERE s.active=TRUE AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND ((s.scope='email' AND LOWER(s.normalized_value)=LOWER(contact.email_normalized))
               OR (s.scope IN ('company_domain','email_domain') AND LOWER(s.normalized_value)=LOWER(p.canonical_domain)))
        )
      ORDER BY CASE WHEN p.qualification_evidence::text ~* 'trade[ _-]?show|conference|expo|exhibit|exhibitor' THEN 0
                    WHEN p.qualification_evidence::text ~* 'event|festival|tournament|gala|opening' THEN 1 ELSE 2 END,
               p.lead_score DESC,p.discovered_at DESC
      LIMIT $2`,
    [batchId, safeLimit],
  );
  return rows.map(mapPreparationCandidate);
}

async function saveDeterministicMorningMessage(sql, data) {
  const rows = await sql(
    `WITH message_upsert AS (
       INSERT INTO outbound_messages (
         prospect_id,contact_id,message_kind,status,subject,body_text,body_html,
         research_summary,personalization_evidence,source_urls,variant_assignments,
         generation_status,generation_key,prompt_version,output_schema_version,
         research_content_hash,model,content_hash,evidence_validation_status,
         generation_metadata,generated_at,estimated_openai_cost_microusd,actual_openai_cost_microusd
       ) VALUES (
         $1,$2,'initial','draft',$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,
         'generated',$10,'deterministic-morning-v1','1.0',$11,'deterministic-morning-v1',$12,
         'passed',$13::jsonb,NOW(),0,0
       )
       ON CONFLICT (prospect_id) WHERE message_kind='initial' DO UPDATE SET
         contact_id=EXCLUDED.contact_id,status='draft',subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,
         body_html=EXCLUDED.body_html,research_summary=EXCLUDED.research_summary,
         personalization_evidence=EXCLUDED.personalization_evidence,source_urls=EXCLUDED.source_urls,
         variant_assignments=EXCLUDED.variant_assignments,generation_status='generated',
         generation_key=EXCLUDED.generation_key,prompt_version=EXCLUDED.prompt_version,
         output_schema_version=EXCLUDED.output_schema_version,research_content_hash=EXCLUDED.research_content_hash,
         model=EXCLUDED.model,content_hash=EXCLUDED.content_hash,evidence_validation_status='passed',
         generation_error_code=NULL,generation_metadata=EXCLUDED.generation_metadata,generated_at=NOW(),updated_at=NOW()
       WHERE outbound_messages.status='draft' AND outbound_messages.sent_at IS NULL
       RETURNING id
     ), prospect_update AS (
       UPDATE outbound_prospects SET personalization_state='generated',personalization_content_hash=$12,
              personalization_failure_code=NULL,last_personalized_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND EXISTS (SELECT 1 FROM message_upsert) RETURNING id
     ) SELECT id FROM message_upsert`,
    [data.prospectId, data.contactId, data.subject, data.bodyText, data.bodyHtml,
      data.researchSummary, jsonValue(data.personalizationEvidence || []), jsonValue(data.sourceUrls || []),
      jsonValue({ source: 'morning_queue', manualSendingOnly: true }), data.generationKey,
      data.researchContentHash, data.contentHash,
      jsonValue({ deterministic: true, manualSendingOnly: true, externalEmailsSent: 0 })],
  );
  return rows[0] || null;
}

async function finalizeMorningBatch(sql, { batchId, targetCount = 70, lastErrorCode = null }) {
  const safeTarget = Math.max(1, Math.min(70, Number(targetCount) || 70));
  await sql(`UPDATE outbound_prospects SET morning_queue_position=NULL,morning_ready_at=NULL WHERE morning_batch_id=$1`, [batchId]);
  const readyRows = await sql(
    `WITH ranked AS (
       SELECT p.id,ROW_NUMBER() OVER (ORDER BY
         CASE WHEN p.qualification_evidence::text ~* 'trade[ _-]?show|conference|expo|exhibit|exhibitor' THEN 0
              WHEN p.qualification_evidence::text ~* 'event|festival|tournament|gala|opening' THEN 1 ELSE 2 END,
         p.lead_score DESC,p.discovered_at DESC)::smallint AS queue_position
       FROM outbound_prospects p
       JOIN outbound_messages m ON m.prospect_id=p.id AND m.message_kind='initial'
         AND m.generation_status='generated' AND m.evidence_validation_status='passed' AND m.status='draft'
       JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
         AND mockup.status='ready' AND mockup.quality_level='logo_and_product'
       JOIN outbound_contacts c ON c.prospect_id=p.id AND c.active=TRUE AND c.is_primary=TRUE
         AND c.syntax_valid=TRUE AND c.mx_status='present' AND c.is_role_address=FALSE
         AND c.is_free_mailbox=FALSE AND c.domain_matches=TRUE
       WHERE p.morning_batch_id=$1 AND p.status='ready_for_outreach' AND p.lead_score>=60
         AND p.first_contacted_at IS NULL AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM outbound_suppressions s WHERE s.active=TRUE
             AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND ((s.scope='email' AND LOWER(s.normalized_value)=LOWER(c.email_normalized))
               OR (s.scope IN ('company_domain','email_domain') AND LOWER(s.normalized_value)=LOWER(p.canonical_domain)))
         )
       ORDER BY CASE WHEN p.qualification_evidence::text ~* 'trade[ _-]?show|conference|expo|exhibit|exhibitor' THEN 0
                     WHEN p.qualification_evidence::text ~* 'event|festival|tournament|gala|opening' THEN 1 ELSE 2 END,
                p.lead_score DESC,p.discovered_at DESC
       LIMIT $2
     )
     UPDATE outbound_prospects p SET morning_queue_position=ranked.queue_position,
            morning_ready_at=NOW(),updated_at=NOW()
       FROM ranked WHERE p.id=ranked.id
     RETURNING p.id,p.morning_queue_position`,
    [batchId, safeTarget],
  );
  const countRows = await sql(
    `SELECT COUNT(*) FILTER (WHERE p.status IN ('qualified','ready_for_outreach'))::integer AS qualified_count,
            COUNT(*) FILTER (WHERE m.generation_status='generated' AND m.evidence_validation_status='passed')::integer AS message_ready_count,
            COUNT(*) FILTER (WHERE mockup.status='ready' AND mockup.quality_level='logo_and_product')::integer AS mockup_ready_count
       FROM outbound_prospects p
       LEFT JOIN outbound_messages m ON m.prospect_id=p.id AND m.message_kind='initial'
       LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
      WHERE p.morning_batch_id=$1`,
    [batchId],
  );
  const counts = countRows[0] || {};
  const status = readyRows.length >= safeTarget ? 'ready' : readyRows.length > 0 ? 'partial' : 'failed';
  const batchRows = await sql(
    `UPDATE outbound_morning_batches SET status=$2,qualified_count=$3,message_ready_count=$4,
            mockup_ready_count=$5,ready_at=NOW(),last_error_code=$6,updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [batchId, status, Number(counts.qualified_count) || 0, Number(counts.message_ready_count) || 0,
      Number(counts.mockup_ready_count) || 0, lastErrorCode],
  );
  return { batch: batchRows[0] || null, readyCount: readyRows.length };
}

async function markMorningBatchFailure(sql, { batchId, errorCode }) {
  const rows = await sql(
    `UPDATE outbound_morning_batches SET status='failed',last_error_code=$2,
            provider_credits_reserved=0,ready_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status<>'ready' RETURNING *`,
    [batchId, String(errorCode || 'MORNING_PREPARATION_FAILED').slice(0, 100)],
  );
  return rows[0] || null;
}

module.exports = {
  ensureMorningBatch,
  claimMorningShard,
  completeMorningShard,
  failMorningShard,
  reserveMorningProviderCredits,
  settleMorningProviderCredits,
  attachMorningProspects,
  listMorningPreparationCandidates,
  saveDeterministicMorningMessage,
  finalizeMorningBatch,
  markMorningBatchFailure,
};
