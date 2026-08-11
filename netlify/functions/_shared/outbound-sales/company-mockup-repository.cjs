'use strict';

const crypto = require('node:crypto');
const { sanitizeForAudit } = require('./security.cjs');

const MAX_AUTOMATIC_MOCKUP_ATTEMPTS = 3;
const MOCKUP_RETRY_BASE_MS = 5 * 60 * 1000;
const MOCKUP_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const COMPANY_MOCKUP_RENDER_VERSION = 'company-banner-v12-clean-assets-adaptive-contrast-bound';
const MIN_MOCKUP_WHITE_TEXT_CONTRAST = 7;
const KNOWN_MOCKUP_LAYOUT_IDS = Object.freeze([
  'balanced_split', 'portrait_feature', 'cutout_spotlight', 'lifestyle_split',
]);

function safeSqlIdentifier(value) {
  const identifier = String(value || '');
  if (!/^[a-z_][a-z0-9_.]*$/i.test(identifier)) throw new TypeError('Unsafe SQL identifier.');
  return identifier;
}

function immutableMockupBlobSql(metadataColumn, blobKeyColumn) {
  const metadata = safeSqlIdentifier(metadataColumn);
  const blobKey = safeSqlIdentifier(blobKeyColumn);
  return `COALESCE((${blobKey} IS NOT NULL
    AND ${metadata} @> '{"blobBindingAudit":{"passed":true,"strongReadBackVerified":true}}'::jsonb
    AND ${metadata}->'blobBindingAudit'->>'expectedContentHash' ~ '^[a-f0-9]{64}$'
    AND ${metadata}->'blobBindingAudit'->>'persistedContentHash'=${metadata}->'blobBindingAudit'->>'expectedContentHash'
    AND ${metadata}->'blobBindingAudit'->>'blobKey'=${blobKey}),FALSE)`;
}

function immutableMockupBlobAuditPassed(generationMetadata, blobKey) {
  const audit = generationMetadata?.blobBindingAudit;
  return Boolean(blobKey)
    && audit?.passed === true
    && audit?.strongReadBackVerified === true
    && audit?.blobKey === blobKey
    && /^[a-f0-9]{64}$/i.test(String(audit?.expectedContentHash || ''))
    && audit.persistedContentHash === audit.expectedContentHash;
}

function sqlTextLiteral(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function strictCompanyMockupReadySql(columns, expectedRenderVersion = COMPANY_MOCKUP_RENDER_VERSION) {
  const prospectId = safeSqlIdentifier(columns.prospectId);
  const status = safeSqlIdentifier(columns.status);
  const renderVersion = safeSqlIdentifier(columns.renderVersion);
  const contentHash = safeSqlIdentifier(columns.contentHash);
  const blobKey = safeSqlIdentifier(columns.blobKey);
  const logoUrl = safeSqlIdentifier(columns.logoUrl);
  const productImageUrl = safeSqlIdentifier(columns.productImageUrl);
  const qualityLevel = safeSqlIdentifier(columns.qualityLevel);
  const messageId = safeSqlIdentifier(columns.messageId);
  const expectedMessageId = safeSqlIdentifier(columns.expectedMessageId);
  const expectedMessageContentHash = safeSqlIdentifier(columns.expectedMessageContentHash);
  const metadata = safeSqlIdentifier(columns.generationMetadata);
  const layouts = KNOWN_MOCKUP_LAYOUT_IDS.map(sqlTextLiteral).join(',');
  return `COALESCE((
    ${status}='ready'
    AND ${renderVersion}=${sqlTextLiteral(expectedRenderVersion)}
    AND ${qualityLevel}='logo_and_product'
    AND NULLIF(${logoUrl},'') IS NOT NULL
    AND NULLIF(${productImageUrl},'') IS NOT NULL
    AND ${messageId} IS NOT NULL AND ${messageId}=${expectedMessageId}
    AND ${expectedMessageContentHash} ~ '^[a-f0-9]{64}$'
    AND ${metadata}->>'messageContentHash'=${expectedMessageContentHash}
    AND ${contentHash} ~ '^[a-f0-9]{64}$'
    AND ${blobKey}='company-banners/' || ${prospectId}::text || '/' || ${contentHash} || '.jpg'
    AND ${metadata} @> '{"compositionAudit":{"passed":true,"noClipGuaranteed":true,"noUpscaleGuaranteed":true},"logoCompositionAudit":{"passed":true,"noClipGuaranteed":true,"noRasterUpscaleGuaranteed":true},"productSelectionAudit":{"passed":true,"sourceVerified":true},"layoutAudit":{"passed":true,"noOverlapGuaranteed":true},"paletteAudit":{"passed":true,"minimumWhiteTextContrast":7}}'::jsonb
    AND ${metadata}->'productSelectionAudit'->>'assetRole' IN ('product_photo','service_photo')
    AND ${metadata}->>'layoutId' IN (${layouts})
    AND ${metadata}->'layoutAudit'->>'layoutId'=${metadata}->>'layoutId'
    AND COALESCE(CASE WHEN ${metadata}->'paletteAudit'->>'primaryWhiteContrast' ~ '^[0-9]+(?:[.][0-9]+)?$'
      THEN (${metadata}->'paletteAudit'->>'primaryWhiteContrast')::numeric END,0) >= ${MIN_MOCKUP_WHITE_TEXT_CONTRAST}
    AND COALESCE(CASE WHEN ${metadata}->'paletteAudit'->>'secondaryWhiteContrast' ~ '^[0-9]+(?:[.][0-9]+)?$'
      THEN (${metadata}->'paletteAudit'->>'secondaryWhiteContrast')::numeric END,0) >= ${MIN_MOCKUP_WHITE_TEXT_CONTRAST}
    AND ${immutableMockupBlobSql(metadata, blobKey)}
  ),FALSE)`;
}

function strictCompanyMockupReady(value, expectedRenderVersion = COMPANY_MOCKUP_RENDER_VERSION) {
  const metadata = value?.generationMetadata || {};
  const composition = metadata.compositionAudit || {};
  const logo = metadata.logoCompositionAudit || {};
  const selection = metadata.productSelectionAudit || {};
  const layout = metadata.layoutAudit || {};
  const palette = metadata.paletteAudit || {};
  const contentHash = String(value?.contentHash || '');
  const expectedMessageContentHash = String(value?.expectedMessageContentHash || '');
  const expectedBlobKey = value?.prospectId && /^[a-f0-9]{64}$/i.test(contentHash)
    ? `company-banners/${value.prospectId}/${contentHash}.jpg`
    : null;
  return value?.status === 'ready'
    && value?.renderVersion === expectedRenderVersion
    && value?.qualityLevel === 'logo_and_product'
    && Boolean(value?.logoUrl) && Boolean(value?.productImageUrl)
    && Boolean(value?.messageId) && value.messageId === value?.expectedMessageId
    && /^[a-f0-9]{64}$/i.test(expectedMessageContentHash)
    && metadata.messageContentHash === expectedMessageContentHash
    && expectedBlobKey !== null && value?.blobKey === expectedBlobKey
    && composition.passed === true && composition.noClipGuaranteed === true
    && composition.noUpscaleGuaranteed === true
    && logo.passed === true && logo.noClipGuaranteed === true
    && logo.noRasterUpscaleGuaranteed === true
    && selection.passed === true && selection.sourceVerified === true
    && ['product_photo', 'service_photo'].includes(selection.assetRole)
    && KNOWN_MOCKUP_LAYOUT_IDS.includes(metadata.layoutId)
    && layout.passed === true && layout.noOverlapGuaranteed === true
    && layout.layoutId === metadata.layoutId
    && palette.passed === true
    && Number(palette.minimumWhiteTextContrast) === MIN_MOCKUP_WHITE_TEXT_CONTRAST
    && Number(palette.primaryWhiteContrast) >= MIN_MOCKUP_WHITE_TEXT_CONTRAST
    && Number(palette.secondaryWhiteContrast) >= MIN_MOCKUP_WHITE_TEXT_CONTRAST
    && immutableMockupBlobAuditPassed(metadata, value.blobKey);
}

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

function safeCompanyMockupErrorCode(value) {
  const candidate = String(value || '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,99}$/.test(candidate)
    ? candidate
    : 'COMPANY_MOCKUP_BUILD_FAILED';
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
      contentHash: row.message_content_hash,
    } : null,
    mockup: row.mockup_id ? {
      id: row.mockup_id,
      messageId: row.mockup_message_id,
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
         message.content_hash AS message_content_hash,
         mockup.id AS mockup_id,mockup.message_id AS mockup_message_id,
         mockup.status AS mockup_status,mockup.scene_id AS mockup_scene_id,
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
      SELECT c.id FROM outbound_contacts c
       WHERE c.prospect_id=p.id AND c.active=TRUE
       ORDER BY c.is_primary DESC,c.contact_quality_score DESC NULLS LAST
       LIMIT 1
    ) contact ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.id,m.subject,m.body_text,m.content_hash FROM outbound_messages m
       WHERE m.prospect_id=p.id AND m.message_kind='initial' AND m.contact_id=contact.id
       ORDER BY m.created_at DESC LIMIT 1
    ) message ON TRUE
    LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id`;

async function loadCompanyMockupCandidate(sql, prospectId) {
  const rows = await sql(`${CANDIDATE_SELECT} WHERE p.id=$1 LIMIT 1`, [prospectId]);
  return mapCandidate(rows[0]);
}

async function listCompanyMockupCandidates(sql, { limit = 70, force = false, renderVersion = null } = {}) {
  const safeLimit = Math.max(1, Math.min(70, Number(limit) || 70));
  const readySql = strictCompanyMockupReadySql({
    prospectId: 'p.id',
    status: 'mockup.status',
    renderVersion: 'mockup.render_version',
    contentHash: 'mockup.content_hash',
    blobKey: 'mockup.blob_key',
    logoUrl: 'mockup.logo_url',
    productImageUrl: 'mockup.product_image_url',
    qualityLevel: 'mockup.quality_level',
    messageId: 'mockup.message_id',
    expectedMessageId: 'message.id',
    expectedMessageContentHash: 'message.content_hash',
    generationMetadata: 'mockup.generation_metadata',
  }, renderVersion || COMPANY_MOCKUP_RENDER_VERSION);
  const rows = await sql(
    `${CANDIDATE_SELECT}
      WHERE p.status IN ('qualified','ready_for_outreach')
        AND p.first_contacted_at IS NULL
        AND p.prior_customer_match=FALSE
        AND p.suppression_reason IS NULL
        AND message.id IS NOT NULL
        AND ($2::boolean=TRUE OR mockup.status IS DISTINCT FROM 'failed' OR (
          COALESCE(CASE WHEN mockup.generation_metadata->'lastAttempt'->>'attemptCount' ~ '^\\d+$'
            THEN (mockup.generation_metadata->'lastAttempt'->>'attemptCount')::integer END,0) < ${MAX_AUTOMATIC_MOCKUP_ATTEMPTS}
          AND COALESCE(CASE WHEN mockup.generation_metadata->'lastAttempt'->>'nextRetryAt'
              ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'
            THEN (mockup.generation_metadata->'lastAttempt'->>'nextRetryAt')::timestamptz END,to_timestamp(0)) <= NOW()
        ))
        AND ($2::boolean=TRUE OR NOT (${readySql}))
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

function failedMockupContentHash(candidate, renderVersion) {
  return crypto.createHash('sha256').update(JSON.stringify({
    prospectId: candidate?.prospect?.id || null,
    messageId: candidate?.message?.id || null,
    messageContentHash: candidate?.message?.contentHash || null,
    renderVersion,
    outcome: 'failed',
  })).digest('hex');
}

function companyMockupRetryState(candidate, renderVersion, failedAt = new Date().toISOString()) {
  const previous = candidate?.mockup?.generationMetadata?.lastAttempt || {};
  const sameContext = previous.messageContentHash === (candidate?.message?.contentHash || null)
    && previous.renderVersion === renderVersion;
  const previousAttempts = sameContext ? Math.max(0, Number(previous.attemptCount) || 0) : 0;
  const attemptCount = Math.min(100, previousAttempts + 1);
  const delayMs = Math.min(MOCKUP_RETRY_MAX_MS, MOCKUP_RETRY_BASE_MS * (2 ** Math.min(8, attemptCount - 1)));
  const failedTime = new Date(failedAt);
  const safeFailedTime = Number.isFinite(failedTime.getTime()) ? failedTime : new Date();
  return {
    attemptCount,
    retryable: attemptCount < MAX_AUTOMATIC_MOCKUP_ATTEMPTS,
    nextRetryAt: new Date(safeFailedTime.getTime() + delayMs).toISOString(),
  };
}

async function saveCompanyMockupFailure(sql, {
  candidate, renderVersion, errorCode, failedAt = new Date().toISOString(),
}) {
  const prospectId = candidate?.prospect?.id;
  if (!prospectId) return null;
  const storedErrorCode = safeCompanyMockupErrorCode(errorCode);
  const current = candidate.mockup || null;
  const preserveCurrentReady = strictCompanyMockupReady({
    prospectId,
    status: current?.status,
    renderVersion: current?.renderVersion,
    contentHash: current?.contentHash,
    blobKey: current?.blobKey,
    logoUrl: current?.logoUrl,
    productImageUrl: current?.productImageUrl,
    qualityLevel: current?.qualityLevel,
    messageId: current?.messageId,
    expectedMessageId: candidate?.message?.id,
    expectedMessageContentHash: candidate?.message?.contentHash,
    generationMetadata: current?.generationMetadata,
  }, renderVersion);
  const retry = companyMockupRetryState(candidate, renderVersion, failedAt);
  const sceneId = ['trade_show', 'storefront', 'community_event'].includes(current?.sceneId)
    ? current.sceneId
    : 'storefront';
  const metadata = jsonValue({
    lastAttempt: {
      status: 'failed',
      errorCode: storedErrorCode,
      failedAt,
      attemptCount: retry.attemptCount,
      retryable: retry.retryable,
      nextRetryAt: retry.nextRetryAt,
      messageContentHash: candidate?.message?.contentHash || null,
      renderVersion,
    },
  });
  const rows = await sql(
    `INSERT INTO outbound_company_mockups (
       prospect_id,message_id,status,scene_id,render_version,content_hash,blob_key,
       mime_type,width,height,logo_url,product_image_url,event_label,quality_level,
       source_urls,generation_metadata,last_error_code,generated_at
     ) VALUES ($1,$2,'failed',$3,$4,$5,NULL,'image/jpeg',1200,675,NULL,NULL,NULL,'name_only',$6::jsonb,$7::jsonb,$8,NULL)
     ON CONFLICT (prospect_id) DO UPDATE SET
       status=CASE
         WHEN $9::boolean=TRUE
         THEN outbound_company_mockups.status ELSE 'failed' END,
       generation_metadata=outbound_company_mockups.generation_metadata || EXCLUDED.generation_metadata,
       last_error_code=EXCLUDED.last_error_code,updated_at=NOW()
     RETURNING *`,
    [
      prospectId,
      candidate?.message?.id || null,
      sceneId,
      renderVersion,
      failedMockupContentHash(candidate, renderVersion),
      jsonValue(candidate?.research?.sourceUrls || []),
      metadata,
      storedErrorCode,
      preserveCurrentReady,
    ],
  );
  return rows[0] || null;
}

module.exports = {
  COMPANY_MOCKUP_RENDER_VERSION,
  MIN_MOCKUP_WHITE_TEXT_CONTRAST,
  KNOWN_MOCKUP_LAYOUT_IDS,
  MAX_AUTOMATIC_MOCKUP_ATTEMPTS,
  MOCKUP_RETRY_BASE_MS,
  MOCKUP_RETRY_MAX_MS,
  immutableMockupBlobSql,
  immutableMockupBlobAuditPassed,
  strictCompanyMockupReadySql,
  strictCompanyMockupReady,
  CANDIDATE_SELECT,
  safeCompanyMockupErrorCode,
  mapCandidate,
  loadCompanyMockupCandidate,
  listCompanyMockupCandidates,
  saveCompanyMockup,
  failedMockupContentHash,
  companyMockupRetryState,
  saveCompanyMockupFailure,
};
