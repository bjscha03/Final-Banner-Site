'use strict';

const { sanitizeForAudit } = require('./security.cjs');
const { polishOutboundSubject, polishOutboundBodyText } = require('./personalization-template.cjs');
const {
  immutableMockupBlobAuditPassed, strictCompanyMockupReadySql, strictCompanyMockupReady,
} = require('./company-mockup-repository.cjs');

const MIN_HIGH_VALUE_SCORE = 60;
const MAX_MANUAL_DAILY_ATTEMPTS = 70;
// A Lambda can disappear without running its failure handler. Keep this long
// enough that an in-flight Resend request is never reclaimed optimistically.
const MANUAL_SEND_LEASE_SECONDS = 15 * 60;
const COMPANY_ALIAS_PATTERN_SQL = String.raw`'\(([^()]{2,80})\)'`;
// These are public, customer-facing company aliases. They remain ineligible for
// automated delivery and are allowed only after the authenticated admin clicks
// Send for one reviewed lead. Operational or sensitive role aliases stay blocked.
const MANUAL_ROLE_LOCAL_PARTS = Object.freeze([
  'contact', 'customercare', 'customerservice', 'events', 'hello', 'help', 'info',
  'inquiries', 'marketing', 'office', 'orders', 'retail', 'sales', 'service', 'store',
  'support', 'team', 'wholesale',
]);
const MANUAL_ROLE_LOCAL_PART_SET = new Set(MANUAL_ROLE_LOCAL_PARTS);
const MANUAL_ROLE_LOCAL_PARTS_SQL = MANUAL_ROLE_LOCAL_PARTS.map((value) => `'${value}'`).join(',');

function emailLocalPart(value) {
  const email = String(value || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return at > 0 && at === email.indexOf('@') ? email.slice(0, at) : '';
}

function isAllowedManualRoleInbox(value) {
  return MANUAL_ROLE_LOCAL_PART_SET.has(emailLocalPart(value));
}

function manualRoleEligibilitySql(roleColumn, emailColumn) {
  return `(${roleColumn}=FALSE OR LOWER(SPLIT_PART(COALESCE(${emailColumn},''),'@',1)) IN (${MANUAL_ROLE_LOCAL_PARTS_SQL}))`;
}

function isManualSingleSendAssessmentEligible(assessment) {
  return assessment?.syntaxValid === true
    && assessment?.mxStatus === 'present'
    && assessment?.isFreeMailbox === false
    && assessment?.domainMatches === true
    && (assessment?.isRoleAddress !== true
      || isAllowedManualRoleInbox(assessment?.emailNormalized || assessment?.email));
}

function companyIdentityNames(businessName) {
  const fullName = String(businessName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!fullName) return [];
  const aliases = [...fullName.matchAll(/\(([^()]{2,80})\)/g)]
    .map((match) => match[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set([fullName, ...aliases])];
}

function messageMatchesCompanyIdentity({ businessName, subject, bodyText }) {
  const normalizedSubject = String(subject || '').toLowerCase();
  const normalizedBody = String(bodyText || '').toLowerCase();
  return companyIdentityNames(businessName).some(
    (identity) => normalizedSubject.includes(identity) && normalizedBody.includes(identity),
  );
}

function manualSendLeaseExpiry(sendStartedAt, leaseSeconds = MANUAL_SEND_LEASE_SECONDS) {
  const startedAt = Date.parse(String(sendStartedAt || ''));
  if (!Number.isFinite(startedAt)) return null;
  return new Date(startedAt + (leaseSeconds * 1000)).toISOString();
}

function manualSendRecoveryStatus(row, now = new Date(), leaseSeconds = MANUAL_SEND_LEASE_SECONDS) {
  if (row?.send_state !== 'processing') return 'not_applicable';
  if (row.resend_message_id || row.review_resend_message_id || row.message_resend_message_id
      || row.sent_at || row.review_sent_at || row.message_sent_at || row.first_contacted_at) return 'delivery_recorded';
  const expiresAt = manualSendLeaseExpiry(row.send_started_at || row.updated_at || row.created_at, leaseSeconds);
  if (!expiresAt || Date.parse(expiresAt) > now.getTime()) return 'in_progress';
  return 'retryable';
}

function companyIdentitySql(company, subject, body) {
  return `(
    (POSITION(LOWER(${company}) IN LOWER(${subject}))>0
      AND POSITION(LOWER(${company}) IN LOWER(${body}))>0)
    OR
    (${company} ~ ${COMPANY_ALIAS_PATTERN_SQL}
      AND POSITION(LOWER(SUBSTRING(${company} FROM ${COMPANY_ALIAS_PATTERN_SQL})) IN LOWER(${subject}))>0
      AND POSITION(LOWER(SUBSTRING(${company} FROM ${COMPANY_ALIAS_PATTERN_SQL})) IN LOWER(${body}))>0)
  )`;
}

function technicalBlockers(row) {
  const blockers = [];
  const recoveryStatus = manualSendRecoveryStatus(row);
  if (!row.contact_id) blockers.push('No active business email');
  if (row.contact_id && row.syntax_valid !== true) blockers.push('Email syntax is not valid');
  if (row.contact_id && !['present', 'not_checked'].includes(row.mx_status)) blockers.push('Email domain has no confirmed mail server');
  if (row.contact_id && row.is_role_address === true && !isAllowedManualRoleInbox(row.contact_email)) {
    blockers.push('Role-based mailbox is not eligible for manual sending');
  }
  if (row.contact_id && row.is_free_mailbox === true) blockers.push('Free mailbox');
  if (row.contact_id && row.domain_matches !== true) blockers.push('Email domain does not match the business');
  if (row.prior_customer_match === true) blockers.push('Existing customer match');
  if (row.suppression_reason) blockers.push(`Suppressed: ${row.suppression_reason}`);
  if (row.active_suppression === true) blockers.push('Active opt-out or delivery suppression');
  if (row.first_contacted_at) blockers.push('This prospect has already been contacted');
  if (recoveryStatus === 'delivery_recorded') blockers.push('A delivery record already exists; this email will not be sent again');
  if (recoveryStatus === 'in_progress') blockers.push('A delivery attempt is still in progress; retry is available only after the safety lease expires');
  if (!row.message_id || row.generation_status !== 'generated' || row.evidence_validation_status !== 'passed') {
    blockers.push('Branded email preview is not ready');
  }
  if (row.message_id && row.message_contact_id && row.contact_id && row.message_contact_id !== row.contact_id) {
    blockers.push('Email draft is not addressed to the selected contact');
  }
  if (!row.message_subject || !row.message_body_text) blockers.push('Email content is incomplete');
  if (!row.mockup_id || row.mockup_status === 'pending') blockers.push('Personalized banner is still preparing');
  else if (row.mockup_status === 'failed') blockers.push('Personalized banner build failed safely and needs a retry');
  else if (row.mockup_status !== 'ready' || row.mockup_quality_level !== 'logo_and_product') {
    blockers.push('Personalized banner needs a verified logo and relevant product/service image');
  } else if (row.mockup_generation_metadata?.compositionAudit?.passed !== true
      || row.mockup_generation_metadata?.compositionAudit?.noClipGuaranteed !== true
      || row.mockup_generation_metadata?.compositionAudit?.noUpscaleGuaranteed !== true) {
    blockers.push('Personalized banner composition has not passed the full-image and no-upscale quality checks');
  } else if (row.mockup_message_id !== row.message_id
      || !row.message_content_hash
      || row.mockup_generation_metadata?.messageContentHash !== row.message_content_hash) {
    blockers.push('Personalized banner is stale for the current email or event details');
  } else if (!immutableMockupBlobAuditPassed(row.mockup_generation_metadata, row.mockup_blob_key)) {
    blockers.push('Personalized banner is not bound to the exact immutable preview image');
  } else if (!strictCompanyMockupReady({
    prospectId: row.prospect_id,
    status: row.mockup_status,
    renderVersion: row.mockup_render_version,
    contentHash: row.mockup_content_hash,
    blobKey: row.mockup_blob_key,
    logoUrl: row.mockup_logo_url,
    productImageUrl: row.mockup_product_image_url,
    qualityLevel: row.mockup_quality_level,
    messageId: row.mockup_message_id,
    expectedMessageId: row.message_id,
    expectedMessageContentHash: row.message_content_hash,
    generationMetadata: row.mockup_generation_metadata,
  })) {
    blockers.push('Personalized banner has not passed the current production-quality contract');
  }
  if (row.business_name && !messageMatchesCompanyIdentity({
    businessName: row.business_name,
    subject: row.message_subject,
    bodyText: row.message_body_text,
  })) {
    blockers.push('Email company-name personalization does not match this lead');
  }
  if (!['qualified', 'ready_for_outreach', 'contacted'].includes(row.prospect_status)) blockers.push('Prospect is not qualified');
  return [...new Set(blockers)];
}

function technicalWarnings(row) {
  const warnings = [];
  if (row.contact_id && isAllowedManualRoleInbox(row.contact_email)) {
    warnings.push('Role inbox — verify this public company mailbox during manual qualification before sending');
  }
  return warnings;
}

function mapLead(row) {
  const blockers = technicalBlockers(row);
  const warnings = technicalWarnings(row);
  const combinedEvidence = [
    ...(Array.isArray(row.qualification_evidence) ? row.qualification_evidence : []),
    ...(Array.isArray(row.score_explanation) ? row.score_explanation : []),
  ];
  const eventEvidence = combinedEvidence.filter((item) => {
    const text = `${item?.code || ''} ${item?.label || ''} ${item?.detail || ''} ${item?.evidence || ''}`;
    return /trade[ _-]?show|conference|expo|exhibit|exhibitor|upcoming[_ ]events?|event|festival|tournament|gala/i.test(text);
  });
  const directTradeShow = eventEvidence.some((item) => /trade[ _-]?show|conference|expo|exhibit|exhibitor/i.test(
    `${item?.label || ''} ${item?.detail || ''} ${item?.evidence || ''}`,
  ));
  const reviewStatus = row.review_status || 'pending';
  const permissionStatus = row.permission_status || 'unknown';
  const sendState = row.send_state || 'not_sent';
  const recoveryStatus = manualSendRecoveryStatus(row);
  const sendLeaseExpiresAt = manualSendLeaseExpiry(row.send_started_at || row.updated_at || row.created_at);
  return {
    prospectId: row.prospect_id,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    canonicalDomain: row.canonical_domain,
    industry: row.industry,
    businessType: row.business_type,
    phone: row.phone,
    address: row.address || {},
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
      subject: polishOutboundSubject(row.message_subject),
      bodyText: polishOutboundBodyText(row.message_body_text),
      bodyHtml: row.message_body_html,
      generationStatus: row.generation_status,
      evidenceValidationStatus: row.evidence_validation_status,
      sentAt: row.message_sent_at,
      deliveredAt: row.message_delivered_at || null,
      lastEventType: row.last_event_type || null,
      lastEventStatus: row.last_event_status || null,
      lastEventAt: row.last_event_at || null,
    } : null,
    mockup: row.mockup_id ? {
      id: row.mockup_id,
      status: row.mockup_status,
      sceneId: row.mockup_scene_id,
      renderVersion: row.mockup_render_version,
      qualityLevel: row.mockup_quality_level,
      logoUrl: row.mockup_logo_url || null,
      productImageUrl: row.mockup_product_image_url || null,
      eventLabel: row.mockup_event_label || null,
      sourceUrls: row.mockup_source_urls || [],
      diagnostics: row.mockup_generation_metadata?.assetDiagnostics || [],
      compositionAudit: row.mockup_generation_metadata?.compositionAudit || null,
      immutablePreviewReady: immutableMockupBlobAuditPassed(
        row.mockup_generation_metadata,
        row.mockup_blob_key,
      ),
      presentationReady: strictCompanyMockupReady({
        prospectId: row.prospect_id,
        status: row.mockup_status,
        renderVersion: row.mockup_render_version,
        contentHash: row.mockup_content_hash,
        blobKey: row.mockup_blob_key,
        logoUrl: row.mockup_logo_url,
        productImageUrl: row.mockup_product_image_url,
        qualityLevel: row.mockup_quality_level,
        messageId: row.mockup_message_id,
        expectedMessageId: row.message_id,
        expectedMessageContentHash: row.message_content_hash,
        generationMetadata: row.mockup_generation_metadata,
      }),
      lastErrorCode: row.mockup_last_error_code || null,
      contextCurrent: Boolean(row.message_content_hash)
        && row.mockup_message_id === row.message_id
        && row.mockup_generation_metadata?.messageContentHash === row.message_content_hash,
      generatedAt: row.mockup_generated_at || null,
      updatedAt: row.mockup_updated_at || null,
      previewUrl: ['ready', 'fallback'].includes(row.mockup_status)
        ? `/.netlify/functions/outbound-sales-company-mockup?prospectId=${encodeURIComponent(row.prospect_id)}&v=${encodeURIComponent(row.mockup_content_hash || '')}`
        : null,
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
      sendStartedAt: row.send_started_at || null,
      sendLeaseExpiresAt,
      recoveryStatus,
    },
    technicalBlockers: blockers,
    technicalWarnings: warnings,
    canSend: blockers.length === 0
      && (['not_sent', 'failed'].includes(sendState) || recoveryStatus === 'retryable'),
    discoveredAt: row.discovered_at,
    importedBusinessDate: row.imported_business_date || null,
    morningQueuePosition: row.morning_queue_position === null ? null : Number(row.morning_queue_position),
    morningReadyAt: row.morning_ready_at || null,
    lastQualifiedAt: row.last_qualified_at,
  };
}

const LEAD_SELECT = `
  SELECT p.id AS prospect_id, p.business_name, p.website_url, p.canonical_domain,
         p.address,
         p.phone, p.industry, p.business_type, p.lead_score,
         p.status AS prospect_status, p.source_provider_id, p.source_url,
         p.score_explanation, p.qualification_evidence, p.prior_customer_match,
         p.suppression_reason, p.first_contacted_at, p.discovered_at, p.last_qualified_at,
         p.imported_business_date,p.morning_batch_id,p.morning_queue_position,p.morning_ready_at,
         review.review_status, review.permission_status, review.permission_evidence,
         review.review_notes, review.reviewed_by, review.reviewed_at,
         review.send_state, review.send_attempt_count, review.send_started_at,
         review.resend_message_id AS review_resend_message_id,
         review.last_send_error_code, review.sent_at AS review_sent_at,
         contact.id AS contact_id, contact.email AS contact_email,
         contact.full_name AS contact_full_name, contact.job_title AS contact_job_title,
         contact.source_url AS contact_source_url, contact.verification_status,
         contact.verification_reason, contact.syntax_valid, contact.mx_status,
         contact.is_role_address, contact.is_free_mailbox, contact.domain_matches,
         contact.contact_quality_score,
         message.id AS message_id, message.contact_id AS message_contact_id,
         message.content_hash AS message_content_hash,
         message.subject AS message_subject,
         message.body_text AS message_body_text, message.body_html AS message_body_html,
         message.generation_status, message.evidence_validation_status,
         message.sent_at AS message_sent_at,message.delivered_at AS message_delivered_at,
         message.resend_message_id AS message_resend_message_id,
         last_event.event_type AS last_event_type,last_event.event_status AS last_event_status,
         last_event.event_at AS last_event_at,
         mockup.id AS mockup_id,mockup.message_id AS mockup_message_id,mockup.status AS mockup_status,
         mockup.scene_id AS mockup_scene_id,mockup.render_version AS mockup_render_version,
         mockup.quality_level AS mockup_quality_level,
         mockup.logo_url AS mockup_logo_url,mockup.product_image_url AS mockup_product_image_url,
         mockup.event_label AS mockup_event_label,mockup.source_urls AS mockup_source_urls,
         mockup.content_hash AS mockup_content_hash,mockup.blob_key AS mockup_blob_key,
         mockup.generation_metadata AS mockup_generation_metadata,
         mockup.last_error_code AS mockup_last_error_code,
         mockup.generated_at AS mockup_generated_at,mockup.updated_at AS mockup_updated_at,
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
       WHERE m.prospect_id=p.id AND m.message_kind='initial' AND m.contact_id=contact.id
       ORDER BY m.created_at DESC
       LIMIT 1
    ) message ON TRUE
    LEFT JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id`;

const LEAD_SELECT_WITH_EVENTS = `${LEAD_SELECT}
    LEFT JOIN LATERAL (
      SELECT event.event_type,event.event_status,event.event_at
        FROM outbound_email_events event
       WHERE event.message_id=message.id
       ORDER BY event.event_at DESC,event.created_at DESC
       LIMIT 1
    ) last_event ON TRUE`;

function cleanFilter(value, maxLength = 120) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

const MOCKUP_READY_SQL = strictCompanyMockupReadySql({
  prospectId: 'prospect_id',
  status: 'mockup_status',
  renderVersion: 'mockup_render_version',
  contentHash: 'mockup_content_hash',
  blobKey: 'mockup_blob_key',
  logoUrl: 'mockup_logo_url',
  productImageUrl: 'mockup_product_image_url',
  qualityLevel: 'mockup_quality_level',
  messageId: 'mockup_message_id',
  expectedMessageId: 'message_id',
  expectedMessageContentHash: 'message_content_hash',
  generationMetadata: 'mockup_generation_metadata',
});
const READY_SQL = `contact_id IS NOT NULL AND syntax_valid=TRUE AND mx_status IN ('present','not_checked')
  AND ${manualRoleEligibilitySql('is_role_address', 'contact_email')} AND is_free_mailbox=FALSE AND domain_matches=TRUE
  AND prior_customer_match=FALSE AND suppression_reason IS NULL AND active_suppression=FALSE
  AND first_contacted_at IS NULL AND message_id IS NOT NULL AND message_contact_id=contact_id AND generation_status='generated'
  AND evidence_validation_status='passed' AND ${companyIdentitySql('business_name', 'message_subject', 'message_body_text')}
  AND (${MOCKUP_READY_SQL})`;
const RETRYABLE_FAILED_MOCKUP_SQL = `mockup_status='failed'
  AND COALESCE(CASE WHEN mockup_generation_metadata->'lastAttempt'->>'attemptCount' ~ '^\\d+$'
    THEN (mockup_generation_metadata->'lastAttempt'->>'attemptCount')::integer END,0) < 3
  AND COALESCE(CASE WHEN mockup_generation_metadata->'lastAttempt'->>'nextRetryAt'
      ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'
    THEN (mockup_generation_metadata->'lastAttempt'->>'nextRetryAt')::timestamptz END,to_timestamp(0)) <= NOW()`;

async function listManualReviewLeads(sql, {
  limit = 50, offset = 0, minimumScore = MIN_HIGH_VALUE_SCORE, reviewView = 'today', filters = {}, sort = 'priority',
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const safeOffset = Math.max(0, Math.min(10000, Number(offset) || 0));
  const safeScore = Math.max(MIN_HIGH_VALUE_SCORE, Math.min(100, Number(minimumScore) || MIN_HIGH_VALUE_SCORE));
  const allowedViews = { today: true, ready: true, sent: true, all: true };
  const safeView = Object.hasOwn(allowedViews, reviewView) ? reviewView : 'today';
  const params = [safeScore];
  const add = (value) => { params.push(value); return `$${params.length}`; };
  const conditions = [];
  if (safeView === 'today') {
    conditions.push(`morning_batch_id IS NOT NULL AND morning_queue_position IS NOT NULL
      AND imported_business_date=(NOW() AT TIME ZONE 'America/New_York')::date`);
    conditions.push("COALESCE(send_state,'not_sent')<>'sent'");
  } else if (safeView === 'ready') {
    conditions.push("COALESCE(send_state,'not_sent')<>'sent'");
    conditions.push(`(${READY_SQL})`);
  }
  else if (safeView === 'sent') conditions.push("send_state='sent'");

  const search = cleanFilter(filters.search, 100);
  if (search) {
    const value = add(`%${search}%`);
    conditions.push(`(business_name ILIKE ${value} OR canonical_domain ILIKE ${value} OR contact_email ILIKE ${value} OR contact_full_name ILIKE ${value} OR phone ILIKE ${value})`);
  }
  const event = cleanFilter(filters.event);
  if (event) conditions.push(`mockup_event_label=${add(event)}`);
  const source = cleanFilter(filters.source, 64);
  if (source) conditions.push(`source_provider_id=${add(source)}`);
  const industry = cleanFilter(filters.industry);
  if (industry) {
    const value = add(`%${industry}%`);
    conditions.push(`(industry ILIKE ${value} OR business_type ILIKE ${value})`);
  }
  const importedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.importedDate || '')) ? String(filters.importedDate) : '';
  if (importedDate) conditions.push(`COALESCE(imported_business_date,(discovered_at AT TIME ZONE 'America/New_York')::date)=${add(importedDate)}::date`);
  if (filters.qualification === 'qualified') conditions.push("prospect_status IN ('qualified','ready_for_outreach','contacted')");
  if (filters.qualification === 'unqualified') conditions.push("prospect_status NOT IN ('qualified','ready_for_outreach','contacted')");
  if (filters.contacted === 'yes') conditions.push('first_contacted_at IS NOT NULL');
  if (filters.contacted === 'no') conditions.push('first_contacted_at IS NULL');
  if (filters.hasEmail === 'yes') conditions.push('contact_id IS NOT NULL');
  if (filters.hasEmail === 'no') conditions.push('contact_id IS NULL');
  if (filters.hasPhone === 'yes') conditions.push("NULLIF(TRIM(phone),'') IS NOT NULL");
  if (filters.hasPhone === 'no') conditions.push("NULLIF(TRIM(phone),'') IS NULL");
  if (filters.mockup === 'ready') conditions.push(`(${MOCKUP_READY_SQL})`);
  if (filters.mockup === 'fallback') conditions.push(`(mockup_status IN ('fallback','failed') OR (mockup_status='ready' AND NOT (${MOCKUP_READY_SQL})))`);
  if (filters.mockup === 'missing') conditions.push("(mockup_id IS NULL OR mockup_status IN ('pending','failed'))");
  if (filters.emailStatus === 'ready') conditions.push("generation_status='generated' AND evidence_validation_status='passed' AND COALESCE(send_state,'not_sent') IN ('not_sent','failed')");
  if (filters.emailStatus === 'sent') conditions.push("send_state='sent'");
  if (filters.emailStatus === 'failed') conditions.push("send_state='failed'");
  if (filters.emailStatus === 'missing') conditions.push("message_id IS NULL OR generation_status<>'generated'");
  if (filters.readiness === 'ready') conditions.push(`(${READY_SQL})`);
  if (filters.readiness === 'needs_attention') conditions.push(`NOT (${READY_SQL})`);

  const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
  const sortSql = {
    newest: 'COALESCE(imported_business_date,discovered_at::date) DESC,discovered_at DESC',
    score_desc: 'lead_score DESC NULLS LAST,business_name',
    company_asc: 'business_name ASC',
    event_asc: 'mockup_event_label ASC NULLS LAST,business_name ASC',
  }[sort] || `CASE WHEN qualification_evidence::text ~* 'trade[ _-]?show|conference|expo|exhibit|exhibitor' THEN 0 WHEN qualification_evidence::text ~* 'upcoming_events|event|festival|tournament|gala' THEN 1 ELSE 2 END,
    morning_queue_position ASC NULLS LAST,lead_score DESC NULLS LAST,last_qualified_at DESC NULLS LAST,discovered_at DESC`;
  const cte = `WITH lead_rows AS (${LEAD_SELECT_WITH_EVENTS}
    WHERE ((p.lead_score >= $1 AND p.status IN ('qualified','ready_for_outreach','contacted')) OR review.prospect_id IS NOT NULL))`;
  const optionCte = `WITH lead_rows AS (${LEAD_SELECT_WITH_EVENTS}
    WHERE ((p.lead_score >= $1 AND p.status IN ('qualified','ready_for_outreach','contacted')) OR review.prospect_id IS NOT NULL))`;
  const [rows, countRows, dailyRows, optionRows, batchRows] = await Promise.all([
    sql(`${cte} SELECT * FROM lead_rows WHERE ${where} ORDER BY ${sortSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, safeLimit, safeOffset]),
    sql(`${cte} SELECT COUNT(*)::integer AS total,
          COUNT(*) FILTER (WHERE COALESCE(send_state,'not_sent')='sent')::integer AS sent,
          COUNT(*) FILTER (WHERE COALESCE(send_state,'not_sent')<>'sent')::integer AS pending,
          COUNT(*) FILTER (WHERE ${MOCKUP_READY_SQL})::integer AS mockup_ready,
          COUNT(*) FILTER (WHERE mockup_status='fallback' OR (mockup_status='ready'
            AND NOT (${MOCKUP_READY_SQL})))::integer AS mockup_fallback,
          COUNT(*) FILTER (WHERE mockup_id IS NULL OR mockup_status='pending')::integer AS mockup_missing,
          COUNT(*) FILTER (WHERE mockup_status='failed')::integer AS mockup_failed,
          COUNT(*) FILTER (WHERE ${RETRYABLE_FAILED_MOCKUP_SQL})::integer AS mockup_retryable_failed
        FROM lead_rows WHERE ${where}`, params),
    sql(`SELECT manual_attempted_count,manual_sent_count
           FROM outbound_daily_delivery_counters
          WHERE business_date=(NOW() AT TIME ZONE 'America/New_York')::date LIMIT 1`),
    sql(`${optionCte} SELECT
          COALESCE(jsonb_agg(DISTINCT mockup_event_label) FILTER (WHERE mockup_event_label IS NOT NULL),'[]'::jsonb) AS events,
          COALESCE(jsonb_agg(DISTINCT source_provider_id) FILTER (WHERE source_provider_id IS NOT NULL),'[]'::jsonb) AS sources,
          COALESCE(jsonb_agg(DISTINCT industry) FILTER (WHERE industry IS NOT NULL),'[]'::jsonb) AS industries
        FROM lead_rows`, [safeScore]),
    sql(`SELECT business_date,target_count,status,discovered_count,new_prospect_count,qualified_count,
                message_ready_count,mockup_ready_count,started_at,ready_at,last_error_code,run_metadata,updated_at
           FROM outbound_morning_batches
          WHERE business_date=(NOW() AT TIME ZONE 'America/New_York')::date
          ORDER BY CASE WHEN batch_key LIKE 'event:%' THEN 0 ELSE 1 END,updated_at DESC
          LIMIT 1`),
  ]);
  const leads = rows.map(mapLead);
  const totals = countRows[0] || {};
  return {
    leads,
    total: Number(totals.total) || 0,
    limit: safeLimit,
    offset: safeOffset,
    minimumScore: safeScore,
    reviewView: safeView,
    filters,
    sort: Object.hasOwn({ priority: true, newest: true, score_desc: true, company_asc: true, event_asc: true }, sort) ? sort : 'priority',
    counts: { pending: Number(totals.pending) || 0, approved: 0, rejected: 0, sent: Number(totals.sent) || 0 },
    mockups: {
      ready: Number(totals.mockup_ready) || 0,
      fallback: Number(totals.mockup_fallback) || 0,
      missing: Number(totals.mockup_missing) || 0,
      failed: Number(totals.mockup_failed) || 0,
      retryableFailed: Number(totals.mockup_retryable_failed) || 0,
    },
    filterOptions: {
      events: (optionRows[0]?.events || []).sort(),
      sources: (optionRows[0]?.sources || []).sort(),
      industries: (optionRows[0]?.industries || []).sort(),
    },
    morningBatch: batchRows[0] ? {
      businessDate: batchRows[0].business_date,
      targetCount: Number(batchRows[0].target_count) || 70,
      status: batchRows[0].status,
      discoveredCount: Number(batchRows[0].discovered_count) || 0,
      newProspectCount: Number(batchRows[0].new_prospect_count) || 0,
      qualifiedCount: Number(batchRows[0].qualified_count) || 0,
      messageReadyCount: Number(batchRows[0].message_ready_count) || 0,
      mockupReadyCount: Number(batchRows[0].mockup_ready_count) || 0,
      startedAt: batchRows[0].started_at || null,
      readyAt: batchRows[0].ready_at || null,
      lastErrorCode: batchRows[0].last_error_code || null,
      runMetadata: batchRows[0].run_metadata || {},
      updatedAt: batchRows[0].updated_at,
    } : null,
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

async function saveManualReviewNote(sql, { prospectId, notes, reviewedBy }) {
  const rows = await sql(
    `INSERT INTO outbound_manual_lead_reviews (prospect_id,review_notes,reviewed_by,reviewed_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       review_notes=EXCLUDED.review_notes,reviewed_by=EXCLUDED.reviewed_by,
       reviewed_at=NOW(),updated_at=NOW()
     RETURNING prospect_id,review_notes,updated_at`,
    [prospectId, String(notes || '').trim().slice(0, 2000) || null, reviewedBy || null],
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
            resend_message_id,last_send_error_code,send_started_at,sent_at
       FROM outbound_manual_lead_reviews WHERE prospect_id=$1 LIMIT 1`,
    [prospectId],
  );
  return rows[0] || null;
}

async function claimManualReviewSend(sql, data) {
  const dailyLimit = Math.max(1, Math.min(MAX_MANUAL_DAILY_ATTEMPTS, Number(data.dailyLimit) || MAX_MANUAL_DAILY_ATTEMPTS));
  const leaseSeconds = Math.max(300, Math.min(3600, Number(data.leaseSeconds) || MANUAL_SEND_LEASE_SECONDS));
  const rows = await sql(
    `WITH candidate AS (
       SELECT review.prospect_id,contact.id AS contact_id,message.id AS message_id,
              review.send_state='processing' AS is_reclaim
         FROM outbound_manual_lead_reviews review
         JOIN outbound_prospects p ON p.id=review.prospect_id
         JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id
         JOIN LATERAL (
           SELECT c.* FROM outbound_contacts c
            WHERE c.prospect_id=p.id AND c.active=TRUE
            ORDER BY c.is_primary DESC,c.contact_quality_score DESC NULLS LAST LIMIT 1
         ) contact ON TRUE
         JOIN LATERAL (
           SELECT m.* FROM outbound_messages m
            WHERE m.prospect_id=p.id AND m.message_kind='initial' AND m.contact_id=contact.id
            ORDER BY m.created_at DESC LIMIT 1
         ) message ON TRUE
        WHERE review.prospect_id=$1
          AND review.review_status='approved' AND review.permission_status IN ('explicit_opt_in','admin_authorized')
          AND review.send_attempt_count<3
          AND (
            review.send_state IN ('not_sent','failed')
            OR (
              review.send_state='processing'
              AND COALESCE(review.send_started_at,review.updated_at,review.created_at)
                    <= NOW()-($6::integer * INTERVAL '1 second')
            )
          )
          AND p.status IN ('qualified','ready_for_outreach')
          AND mockup.status='ready' AND mockup.quality_level='logo_and_product'
          AND mockup.message_id=message.id AND mockup.content_hash=$5
          AND NULLIF(message.content_hash,'') IS NOT NULL
          AND mockup.generation_metadata->>'messageContentHash'=message.content_hash
          AND mockup.generation_metadata @> '{"compositionAudit":{"passed":true,"noClipGuaranteed":true}}'::jsonb
          AND (${strictCompanyMockupReadySql({
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
  })})
          AND review.resend_message_id IS NULL AND review.sent_at IS NULL
          AND message.resend_message_id IS NULL AND message.sent_at IS NULL
          AND p.first_contacted_at IS NULL AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL
          AND contact.syntax_valid=TRUE AND contact.mx_status='present'
          AND ${manualRoleEligibilitySql('contact.is_role_address', 'contact.email_normalized')}
          AND contact.is_free_mailbox=FALSE AND contact.domain_matches=TRUE
          AND message.generation_status='generated' AND message.evidence_validation_status='passed'
          AND message.status='draft' AND message.subject IS NOT NULL AND message.body_text IS NOT NULL
          AND ${companyIdentitySql('p.business_name', 'message.subject', 'message.body_text')}
          AND NOT EXISTS (
            SELECT 1 FROM outbound_suppressions suppression
             WHERE suppression.active=TRUE AND (suppression.expires_at IS NULL OR suppression.expires_at>NOW())
               AND ((suppression.scope='email' AND LOWER(suppression.normalized_value)=LOWER(contact.email_normalized))
                 OR (suppression.scope IN ('company_domain','email_domain') AND LOWER(suppression.normalized_value)=LOWER(p.canonical_domain)))
          )
        FOR UPDATE OF review
     ), counter AS (
       INSERT INTO outbound_daily_delivery_counters (business_date,manual_attempted_count)
       SELECT $2,1 FROM candidate WHERE NOT candidate.is_reclaim
       ON CONFLICT (business_date) DO UPDATE
         SET manual_attempted_count=outbound_daily_delivery_counters.manual_attempted_count+1,updated_at=NOW()
         WHERE outbound_daily_delivery_counters.manual_attempted_count<$3
       RETURNING business_date
     )
     UPDATE outbound_manual_lead_reviews review
        SET send_state='processing',send_key=COALESCE(review.send_key,$4),
            send_attempt_count=review.send_attempt_count+CASE WHEN candidate.is_reclaim THEN 0 ELSE 1 END,
            send_started_at=NOW(),
            last_send_error_code=NULL,updated_at=NOW()
       FROM candidate
       LEFT JOIN counter ON TRUE,
            outbound_prospects p,outbound_contacts contact,outbound_messages message
      WHERE review.prospect_id=candidate.prospect_id
        AND p.id=candidate.prospect_id AND contact.id=candidate.contact_id AND message.id=candidate.message_id
        AND message.contact_id=contact.id
        AND (candidate.is_reclaim OR counter.business_date IS NOT NULL)
        AND (
          review.send_state IN ('not_sent','failed')
          OR (review.send_state='processing'
              AND COALESCE(review.send_started_at,review.updated_at,review.created_at)
                    <= NOW()-($6::integer * INTERVAL '1 second'))
        )
      RETURNING review.prospect_id,review.send_key,review.send_attempt_count,
                p.business_name,p.status AS prospect_status,
                contact.id AS contact_id,contact.email,
                message.id AS message_id,message.contact_id AS message_contact_id,message.campaign_id,message.subject,
                message.body_text,message.generation_status,message.evidence_validation_status`,
    [data.prospectId, data.businessDate, dailyLimit, data.sendKey, data.mockupContentHash, leaseSeconds],
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
        WHERE message.id=$5 AND message.prospect_id=review.prospect_id AND message.contact_id=$9
          AND message.status='draft'
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
      JSON.stringify(sanitizeForAudit({ provider: 'resend', permissionBasis: 'admin_authorized', latencyMs: data.latencyMs })),
      data.contactId],
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
  MANUAL_SEND_LEASE_SECONDS,
  MANUAL_ROLE_LOCAL_PARTS,
  companyIdentityNames,
  messageMatchesCompanyIdentity,
  manualSendLeaseExpiry,
  manualSendRecoveryStatus,
  isAllowedManualRoleInbox,
  isManualSingleSendAssessmentEligible,
  technicalBlockers,
  technicalWarnings,
  mapLead,
  listManualReviewLeads,
  saveManualReview,
  saveManualReviewNote,
  authorizeManualSend,
  loadManualReviewContact,
  saveManualContactAssessment,
  loadManualReviewState,
  claimManualReviewSend,
  markManualReviewSent,
  markManualReviewFailed,
};
