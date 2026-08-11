'use strict';

const { sanitizeForAudit } = require('./security.cjs');
const {
  immutableMockupBlobSql,
  immutableMockupBlobAuditPassed,
} = require('./company-mockup-repository.cjs');

const MANUAL_ARTWORK_RENDER_VERSION = 'company-banner-manual-upload-v1';
const MANUAL_ARTWORK_QUALITY_LEVEL = 'manual_upload';
const MANUAL_ARTWORK_WIDTH = 1200;
const MANUAL_ARTWORK_HEIGHT = 675;

function safeSqlIdentifier(value) {
  const identifier = String(value || '');
  if (!/^[a-z_][a-z0-9_.]*$/i.test(identifier)) throw new TypeError('Unsafe SQL identifier.');
  return identifier;
}

function sqlTextLiteral(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function manualArtworkReadySql(columns) {
  const prospectId = safeSqlIdentifier(columns.prospectId);
  const status = safeSqlIdentifier(columns.status);
  const renderVersion = safeSqlIdentifier(columns.renderVersion);
  const contentHash = safeSqlIdentifier(columns.contentHash);
  const blobKey = safeSqlIdentifier(columns.blobKey);
  const qualityLevel = safeSqlIdentifier(columns.qualityLevel);
  const messageId = safeSqlIdentifier(columns.messageId);
  const expectedMessageId = safeSqlIdentifier(columns.expectedMessageId);
  const expectedMessageContentHash = safeSqlIdentifier(columns.expectedMessageContentHash);
  const metadata = safeSqlIdentifier(columns.generationMetadata);
  return `COALESCE((
    ${status}='ready'
    AND ${renderVersion}=${sqlTextLiteral(MANUAL_ARTWORK_RENDER_VERSION)}
    AND ${qualityLevel}=${sqlTextLiteral(MANUAL_ARTWORK_QUALITY_LEVEL)}
    AND ${messageId} IS NOT NULL AND ${messageId}=${expectedMessageId}
    AND ${expectedMessageContentHash} ~ '^[a-f0-9]{64}$'
    AND ${metadata}->>'messageContentHash'=${expectedMessageContentHash}
    AND ${contentHash} ~ '^[a-f0-9]{64}$'
    AND ${blobKey}='manual-company-banners/' || ${prospectId}::text || '/' || ${contentHash} || '.jpg'
    AND ${metadata} @> '{"source":"manual_upload","manualReviewAudit":{"passed":true,"administratorUploaded":true},"imageAudit":{"passed":true,"format":"jpeg","width":1200,"height":675,"fit":"contain","noCrop":true}}'::jsonb
    AND ${metadata}->'blobBindingAudit'->>'expectedContentHash'=${contentHash}
    AND ${immutableMockupBlobSql(metadata, blobKey)}
  ),FALSE)`;
}

function manualArtworkReady(value) {
  const metadata = value?.generationMetadata || {};
  const imageAudit = metadata.imageAudit || {};
  const manualReviewAudit = metadata.manualReviewAudit || {};
  const contentHash = String(value?.contentHash || '');
  const expectedMessageContentHash = String(value?.expectedMessageContentHash || '');
  const expectedBlobKey = value?.prospectId && /^[a-f0-9]{64}$/i.test(contentHash)
    ? `manual-company-banners/${value.prospectId}/${contentHash}.jpg`
    : null;
  return value?.status === 'ready'
    && value?.renderVersion === MANUAL_ARTWORK_RENDER_VERSION
    && value?.qualityLevel === MANUAL_ARTWORK_QUALITY_LEVEL
    && Boolean(value?.messageId) && value.messageId === value?.expectedMessageId
    && /^[a-f0-9]{64}$/i.test(expectedMessageContentHash)
    && metadata.messageContentHash === expectedMessageContentHash
    && expectedBlobKey !== null && value?.blobKey === expectedBlobKey
    && metadata.source === 'manual_upload'
    && manualReviewAudit.passed === true
    && manualReviewAudit.administratorUploaded === true
    && imageAudit.passed === true
    && imageAudit.format === 'jpeg'
    && Number(imageAudit.width) === MANUAL_ARTWORK_WIDTH
    && Number(imageAudit.height) === MANUAL_ARTWORK_HEIGHT
    && imageAudit.fit === 'contain'
    && imageAudit.noCrop === true
    && metadata.blobBindingAudit?.expectedContentHash === contentHash
    && immutableMockupBlobAuditPassed(metadata, value.blobKey);
}

function mapManualArtworkCandidate(row) {
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
      status: row.prospect_status,
    },
    contact: row.contact_id ? {
      id: row.contact_id,
      email: row.contact_email,
    } : null,
    message: row.message_id ? {
      id: row.message_id,
      contactId: row.message_contact_id,
      subject: row.message_subject,
      bodyText: row.message_body_text,
      contentHash: row.message_content_hash,
      generationStatus: row.generation_status,
      evidenceValidationStatus: row.evidence_validation_status,
      status: row.message_status,
    } : null,
    artwork: row.mockup_id ? {
      id: row.mockup_id,
      messageId: row.mockup_message_id,
      status: row.mockup_status,
      renderVersion: row.mockup_render_version,
      contentHash: row.mockup_content_hash,
      blobKey: row.mockup_blob_key,
      mimeType: row.mockup_mime_type,
      width: Number(row.mockup_width) || null,
      height: Number(row.mockup_height) || null,
      qualityLevel: row.mockup_quality_level,
      generationMetadata: row.mockup_generation_metadata || {},
      generatedAt: row.mockup_generated_at || null,
      updatedAt: row.mockup_updated_at || null,
    } : null,
  };
}

async function loadManualArtworkCandidate(sql, prospectId) {
  const rows = await sql(
    `SELECT p.id AS prospect_id,p.business_name,p.website_url,p.canonical_domain,
            p.industry,p.business_type,p.qualification_evidence,p.status AS prospect_status,
            contact.id AS contact_id,contact.email AS contact_email,
            message.id AS message_id,message.contact_id AS message_contact_id,
            message.subject AS message_subject,message.body_text AS message_body_text,
            message.content_hash AS message_content_hash,message.status AS message_status,
            message.generation_status,message.evidence_validation_status,
            mockup.id AS mockup_id,mockup.message_id AS mockup_message_id,
            mockup.status AS mockup_status,mockup.render_version AS mockup_render_version,
            mockup.content_hash AS mockup_content_hash,mockup.blob_key AS mockup_blob_key,
            mockup.mime_type AS mockup_mime_type,mockup.width AS mockup_width,
            mockup.height AS mockup_height,mockup.quality_level AS mockup_quality_level,
            mockup.generation_metadata AS mockup_generation_metadata,
            mockup.generated_at AS mockup_generated_at,mockup.updated_at AS mockup_updated_at
       FROM outbound_prospects p
       LEFT JOIN LATERAL (
         SELECT c.* FROM outbound_contacts c
          WHERE c.prospect_id=p.id AND c.active=TRUE
          ORDER BY c.is_primary DESC,c.contact_quality_score DESC NULLS LAST
          LIMIT 1
       ) contact ON TRUE
       LEFT JOIN LATERAL (
         SELECT m.* FROM outbound_messages m
          WHERE m.prospect_id=p.id AND m.message_kind='initial' AND m.contact_id=contact.id
          ORDER BY m.created_at DESC
          LIMIT 1
       ) message ON TRUE
       LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
      WHERE p.id=$1
      LIMIT 1`,
    [prospectId],
  );
  return mapManualArtworkCandidate(rows[0]);
}

function jsonValue(value) {
  return JSON.stringify(sanitizeForAudit(value));
}

async function saveManualArtwork(sql, data) {
  const rows = await sql(
    `INSERT INTO outbound_company_mockups (
       prospect_id,message_id,status,scene_id,render_version,content_hash,blob_key,
       mime_type,width,height,logo_url,product_image_url,event_label,quality_level,
       source_urls,generation_metadata,last_error_code,generated_at
     ) VALUES ($1,$2,'ready','trade_show',$3,$4,$5,'image/jpeg',$6,$7,NULL,NULL,$8,$9,'[]'::jsonb,$10::jsonb,NULL,NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       message_id=EXCLUDED.message_id,status='ready',scene_id='trade_show',
       render_version=EXCLUDED.render_version,content_hash=EXCLUDED.content_hash,
       blob_key=EXCLUDED.blob_key,mime_type='image/jpeg',width=EXCLUDED.width,height=EXCLUDED.height,
       logo_url=NULL,product_image_url=NULL,event_label=EXCLUDED.event_label,
       quality_level=EXCLUDED.quality_level,source_urls='[]'::jsonb,
       generation_metadata=EXCLUDED.generation_metadata,last_error_code=NULL,
       generated_at=NOW(),updated_at=NOW()
     RETURNING *`,
    [
      data.prospectId,
      data.messageId,
      MANUAL_ARTWORK_RENDER_VERSION,
      data.contentHash,
      data.blobKey,
      MANUAL_ARTWORK_WIDTH,
      MANUAL_ARTWORK_HEIGHT,
      data.eventLabel || null,
      MANUAL_ARTWORK_QUALITY_LEVEL,
      jsonValue(data.generationMetadata || {}),
    ],
  );
  return rows[0] || null;
}

async function refreshManualArtworkBatchCount(sql, prospectId) {
  const readySql = manualArtworkReadySql({
    prospectId: 'p.id',
    status: 'mockup.status',
    renderVersion: 'mockup.render_version',
    contentHash: 'mockup.content_hash',
    blobKey: 'mockup.blob_key',
    qualityLevel: 'mockup.quality_level',
    messageId: 'mockup.message_id',
    expectedMessageId: 'message.id',
    expectedMessageContentHash: 'message.content_hash',
    generationMetadata: 'mockup.generation_metadata',
  });
  const rows = await sql(
    `WITH target AS (
       SELECT morning_batch_id FROM outbound_prospects WHERE id=$1
     ), counts AS (
       SELECT p.morning_batch_id,COUNT(*) FILTER (WHERE ${readySql})::integer AS ready_count
         FROM outbound_prospects p
         LEFT JOIN outbound_messages message ON message.prospect_id=p.id AND message.message_kind='initial'
         LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
        WHERE p.morning_batch_id=(SELECT morning_batch_id FROM target)
        GROUP BY p.morning_batch_id
     )
     UPDATE outbound_morning_batches batch
        SET mockup_ready_count=counts.ready_count,updated_at=NOW()
       FROM counts
      WHERE batch.id=counts.morning_batch_id
      RETURNING batch.id,batch.mockup_ready_count`,
    [prospectId],
  );
  return rows[0] || null;
}

module.exports = {
  MANUAL_ARTWORK_RENDER_VERSION,
  MANUAL_ARTWORK_QUALITY_LEVEL,
  MANUAL_ARTWORK_WIDTH,
  MANUAL_ARTWORK_HEIGHT,
  manualArtworkReadySql,
  manualArtworkReady,
  mapManualArtworkCandidate,
  loadManualArtworkCandidate,
  saveManualArtwork,
  refreshManualArtworkBatchCount,
};
