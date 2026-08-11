'use strict';

const { sanitizeForAudit } = require('./security.cjs');

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

function mapCandidate(row) {
  if (!row) return null;
  return {
    prospect: {
      id: row.prospect_id,
      businessName: row.business_name,
      websiteUrl: row.website_url,
      canonicalDomain: row.canonical_domain,
      industry: row.industry,
      businessType: row.business_type,
      qualificationEvidence: row.qualification_evidence || [],
    },
    research: row.research_content_hash ? {
      contentHash: row.research_content_hash,
      extractedFacts: row.extracted_facts || {},
      evidence: row.research_evidence || [],
      bannerNeedSignals: row.banner_need_signals || [],
      sourceUrls: row.research_source_urls || [],
    } : null,
    message: row.message_id ? {
      id: row.message_id,
      subject: row.message_subject,
      bodyText: row.message_body_text,
    } : null,
    mockup: row.mockup_id ? {
      id: row.mockup_id,
      status: row.mockup_status,
      sceneId: row.mockup_scene_id,
      renderVersion: row.mockup_render_version,
      contentHash: row.mockup_content_hash,
      blobKey: row.mockup_blob_key,
      mimeType: row.mockup_mime_type,
      width: Number(row.mockup_width) || 1200,
      height: Number(row.mockup_height) || 675,
      logoUrl: row.mockup_logo_url,
      productImageUrl: row.mockup_product_image_url,
      eventLabel: row.mockup_event_label,
      qualityLevel: row.mockup_quality_level,
      sourceUrls: row.mockup_source_urls || [],
      generationMetadata: row.mockup_generation_metadata || {},
      lastErrorCode: row.mockup_last_error_code,
      generatedAt: row.mockup_generated_at,
      updatedAt: row.mockup_updated_at,
    } : null,
  };
}

const CANDIDATE_SELECT = `
  SELECT p.id AS prospect_id,p.business_name,p.website_url,p.canonical_domain,
         p.industry,p.business_type,p.qualification_evidence,
         research.content_hash AS research_content_hash,
         research.extracted_facts,research.evidence AS research_evidence,
         research.banner_need_signals,research.source_urls AS research_source_urls,
         message.id AS message_id,message.subject AS message_subject,message.body_text AS message_body_text,
         mockup.id AS mockup_id,mockup.status AS mockup_status,mockup.scene_id AS mockup_scene_id,
         mockup.render_version AS mockup_render_version,mockup.content_hash AS mockup_content_hash,
         mockup.blob_key AS mockup_blob_key,mockup.mime_type AS mockup_mime_type,
         mockup.width AS mockup_width,mockup.height AS mockup_height,
         mockup.logo_url AS mockup_logo_url,mockup.product_image_url AS mockup_product_image_url,
         mockup.event_label AS mockup_event_label,mockup.quality_level AS mockup_quality_level,
         mockup.source_urls AS mockup_source_urls,mockup.generation_metadata AS mockup_generation_metadata,
         mockup.last_error_code AS mockup_last_error_code,mockup.generated_at AS mockup_generated_at,
         mockup.updated_at AS mockup_updated_at
    FROM outbound_prospects p
    LEFT JOIN LATERAL (
      SELECT r.content_hash,r.extracted_facts,r.evidence,r.banner_need_signals,r.source_urls
        FROM outbound_research_snapshots r WHERE r.prospect_id=p.id
       ORDER BY r.fetched_at DESC LIMIT 1
    ) research ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.id,m.subject,m.body_text FROM outbound_messages m
       WHERE m.prospect_id=p.id AND m.message_kind='initial'
       ORDER BY m.created_at DESC LIMIT 1
    ) message ON TRUE
    LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id`;

async function loadCompanyMockupCandidate(sql, prospectId) {
  const rows = await sql(`${CANDIDATE_SELECT} WHERE p.id=$1 LIMIT 1`, [prospectId]);
  return mapCandidate(rows[0]);
}

async function listCompanyMockupCandidates(sql, { limit = 70, force = false } = {}) {
  const safeLimit = Math.max(1, Math.min(70, Number(limit) || 70));
  const rows = await sql(
    `${CANDIDATE_SELECT}
      WHERE p.status IN ('qualified','ready_for_outreach')
        AND p.first_contacted_at IS NULL
        AND p.prior_customer_match=FALSE
        AND p.suppression_reason IS NULL
        AND message.id IS NOT NULL
        AND ($2::boolean=TRUE OR mockup.id IS NULL OR mockup.status IN ('pending','failed'))
      ORDER BY CASE WHEN p.qualification_evidence::text ~* 'trade[ _-]?show|conference|expo|exhibit' THEN 0 ELSE 1 END,
               p.lead_score DESC NULLS LAST,p.last_qualified_at DESC NULLS LAST
      LIMIT $1`,
    [safeLimit, force === true],
  );
  return rows.map(mapCandidate);
}

async function saveCompanyMockup(sql, data) {
  const rows = await sql(
    `INSERT INTO outbound_company_mockups (
       prospect_id,message_id,status,scene_id,render_version,content_hash,blob_key,
       mime_type,width,height,logo_url,product_image_url,event_label,quality_level,
       source_urls,generation_metadata,last_error_code,generated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'image/jpeg',1200,675,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       message_id=EXCLUDED.message_id,status=EXCLUDED.status,scene_id=EXCLUDED.scene_id,
       render_version=EXCLUDED.render_version,content_hash=EXCLUDED.content_hash,
       blob_key=EXCLUDED.blob_key,mime_type=EXCLUDED.mime_type,width=EXCLUDED.width,height=EXCLUDED.height,
       logo_url=EXCLUDED.logo_url,product_image_url=EXCLUDED.product_image_url,event_label=EXCLUDED.event_label,
       quality_level=EXCLUDED.quality_level,source_urls=EXCLUDED.source_urls,
       generation_metadata=EXCLUDED.generation_metadata,last_error_code=EXCLUDED.last_error_code,
       generated_at=NOW(),updated_at=NOW()
     RETURNING *`,
    [
      data.prospectId, data.messageId || null, data.status, data.sceneId, data.renderVersion,
      data.contentHash, data.blobKey || null, data.logoUrl || null, data.productImageUrl || null,
      data.eventLabel || null, data.qualityLevel, jsonValue(data.sourceUrls || []),
      jsonValue(data.generationMetadata || {}), data.lastErrorCode || null,
    ],
  );
  return rows[0] || null;
}

module.exports = {
  CANDIDATE_SELECT,
  mapCandidate,
  loadCompanyMockupCandidate,
  listCompanyMockupCandidates,
  saveCompanyMockup,
};
