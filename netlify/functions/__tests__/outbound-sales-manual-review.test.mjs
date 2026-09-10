import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import serverAuth from '../_shared/server-auth.cjs';
import delivery from '../_shared/outbound-sales/outbound-delivery.cjs';
import handlerModule from '../_shared/outbound-sales/manual-review-handler.cjs';
import repository from '../_shared/outbound-sales/manual-review-repository.cjs';
import strategy from '../_shared/outbound-sales/prospecting-strategy.cjs';
import migration29 from '../../../migrations/029_outbound_manual_lead_review.sql?raw';
import rollback29 from '../../../migrations/029_outbound_manual_lead_review.rollback.sql?raw';
import migration30 from '../../../migrations/030_outbound_admin_authorized_send.sql?raw';
import rollback30 from '../../../migrations/030_outbound_admin_authorized_send.rollback.sql?raw';

const { createSessionToken } = serverAuth;
const { resolveUnsubscribeSigningSecret, sendPermissionedMarketingMessage } = delivery;
const {
  createManualReviewHandler, stableManualSendKey,
  validateManualDeliveryConfiguration, deliveryStatus,
} = handlerModule;
const {
  mapLead, messageMatchesCompanyIdentity, MAX_MANUAL_DAILY_ATTEMPTS,
  MANUAL_ROLE_LOCAL_PARTS, MANUAL_SEND_LEASE_SECONDS, manualSendRecoveryStatus,
  isAllowedManualRoleInbox, isManualSingleSendAssessmentEligible,
} = repository;
const { EVENT_FIRST_INDUSTRY_KEYWORDS, selectProspectingKeywords } = strategy;

const originalEnvironment = { ...process.env };
const PROSPECT_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const CONTACT_B_ID = '22222222-2222-4222-8222-222222222223';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const MOCKUP_CONTENT_HASH = 'd'.repeat(64);
const MOCKUP_BLOB_KEY = `manual-company-banners/${PROSPECT_ID}/${MOCKUP_CONTENT_HASH}.jpg`;
const MOCKUP_BLOB_HASH = MOCKUP_CONTENT_HASH;
const MOCKUP_PUBLIC_ID = `outbound-sales/manual-company-banners/${PROSPECT_ID}/${MOCKUP_CONTENT_HASH}`;
const MOCKUP_PUBLIC_URL = `https://res.cloudinary.com/dtrxl120u/image/upload/v123/${MOCKUP_PUBLIC_ID}.jpg`;

function deliveryAsset(contentHash = MOCKUP_CONTENT_HASH) {
  const publicId = `outbound-sales/manual-company-banners/${PROSPECT_ID}/${contentHash}`;
  return {
    provider: 'cloudinary', deliveryType: 'upload', cloudName: 'dtrxl120u', publicId,
    secureUrl: `https://res.cloudinary.com/dtrxl120u/image/upload/v123/${publicId}.jpg`,
    assetId: 'cloudinary-asset-1', version: 123, format: 'jpg', width: 1200, height: 675,
    bytes: 45678, contentHash,
    publicationAudit: { passed: true, publiclyHosted: true, emailEmbeddable: true },
  };
}

const deliveryEnvironment = {
  DATABASE_URL: 'postgres://test.invalid/database',
  OUTBOUND_MANUAL_SEND_ENABLED: 'true',
  PUBLIC_SITE_URL: 'https://bannersonthefly.com',
  OUTBOUND_PERMISSIONED_RESEND_API_KEY: 're_test_permissioned_marketing_key',
  OUTBOUND_PERMISSIONED_FROM_EMAIL: 'info@bannersonthefly.com',
  OUTBOUND_PERMISSIONED_REPLY_TO_EMAIL: 'support@bannersonthefly.com',
  OUTBOUND_UNSUBSCRIBE_SIGNING_SECRET: 'manual-review-signing-secret-at-least-32-characters',
  OUTBOUND_PHYSICAL_ADDRESS: '100 Example Street, Boston, MA 02108',
};

function adminEvent(method, body = {}) {
  const token = createSessionToken({ id: 'admin-1', email: 'admin@bannersonthefly.com', is_admin: true });
  return {
    httpMethod: method,
    headers: {
      authorization: `Bearer ${token}`,
      origin: 'https://bannersonthefly.com',
      host: 'bannersonthefly.com',
      'x-forwarded-proto': 'https',
      'x-nf-request-id': 'manual-review-test',
    },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

function rowFixture() {
  return {
    prospect_id: PROSPECT_ID,
    business_name: 'Future Expo Group',
    website_url: 'https://futureexpo.example',
    canonical_domain: 'futureexpo.example',
    industry: 'Trade show organizer',
    business_type: 'Events',
    phone: '555-0100',
    lead_score: 92,
    prospect_status: 'ready_for_outreach',
    source_provider_id: 'licensed_fixture',
    source_url: 'https://source.example/future-expo',
    score_explanation: [{ factor: 'industry', label: 'Event-driven business', detail: 'Trade show organizer' }],
    qualification_evidence: [{ code: 'upcoming_events', evidence: 'The 2026 exhibitor expo is listed on the event calendar.', sourceUrl: 'https://futureexpo.example/events' }],
    prior_customer_match: false,
    suppression_reason: null,
    first_contacted_at: null,
    contact_id: CONTACT_ID,
    contact_email: 'events@futureexpo.example',
    contact_full_name: 'Taylor Lee',
    contact_job_title: 'Events Director',
    contact_source_url: 'https://futureexpo.example/contact',
    verification_status: 'valid',
    verification_reason: 'Mailbox verified',
    syntax_valid: true,
    mx_status: 'not_checked',
    is_role_address: false,
    is_free_mailbox: false,
    domain_matches: true,
    contact_quality_score: 95,
    message_id: MESSAGE_ID,
    message_contact_id: CONTACT_ID,
    message_content_hash: 'c'.repeat(64),
    message_subject: 'Future Expo Group: banner planning for your exhibitor expo',
    message_body_text: 'Hi Taylor,\n\nI saw Future Expo Group has an upcoming exhibitor expo.\n\nBest,\nBrandon\nBanners On The Fly',
    message_body_html: '<html><body>Preview</body></html>',
    generation_status: 'generated',
    evidence_validation_status: 'passed',
    message_sent_at: null,
    mockup_id: '44444444-4444-4444-8444-444444444444',
    mockup_message_id: MESSAGE_ID,
    mockup_status: 'ready',
    mockup_scene_id: 'trade_show',
    mockup_render_version: 'company-banner-manual-upload-v2',
    mockup_quality_level: 'manual_upload',
    mockup_logo_url: null,
    mockup_product_image_url: null,
    mockup_event_label: 'Future Expo',
    mockup_source_urls: ['https://futureexpo.example'],
    mockup_content_hash: MOCKUP_CONTENT_HASH,
    mockup_blob_key: MOCKUP_BLOB_KEY,
    mockup_generation_metadata: {
      source: 'manual_upload',
      messageContentHash: 'c'.repeat(64),
      manualReviewAudit: { passed: true, administratorUploaded: true },
      imageAudit: { passed: true, format: 'jpeg', width: 1200, height: 675, fit: 'contain', noCrop: true },
      blobBindingAudit: {
        passed: true, strongReadBackVerified: true, blobKey: MOCKUP_BLOB_KEY,
        expectedContentHash: MOCKUP_BLOB_HASH, persistedContentHash: MOCKUP_BLOB_HASH,
      },
      emailImageDelivery: deliveryAsset(),
      emailImageReady: true,
    },
    mockup_generated_at: '2026-08-10T11:30:00Z',
    review_status: 'pending',
    permission_status: 'unknown',
    permission_evidence: null,
    review_notes: '',
    reviewed_by: 'admin@bannersonthefly.com',
    reviewed_at: '2026-08-10T12:00:00Z',
    send_state: 'not_sent',
    send_attempt_count: 0,
    review_resend_message_id: null,
    last_send_error_code: null,
    review_sent_at: null,
    active_suppression: false,
    discovered_at: '2026-08-10T10:00:00Z',
    last_qualified_at: '2026-08-10T11:00:00Z',
  };
}

function verifiedArtwork(overrides = {}) {
  return {
    prospectId: PROSPECT_ID,
    businessName: 'Future Expo Group',
    buffer: Buffer.from('exact-reviewed-company-banner'),
    contentHash: 'f'.repeat(64),
    blobKey: `manual-company-banners/${PROSPECT_ID}/${'f'.repeat(64)}.jpg`,
    mimeType: 'image/jpeg',
    width: 1200,
    height: 675,
    messageId: MESSAGE_ID,
    messageContentHash: 'c'.repeat(64),
    publicUrl: deliveryAsset('f'.repeat(64)).secureUrl,
    deliveryAsset: deliveryAsset('f'.repeat(64)),
    emailImageReady: true,
    sendReady: true,
    cached: true,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'manual-review-test-session-secret';
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('manual lead review migration and qualification', () => {
  it('binds Today rows, counts, options, and summary to one event-first batch when generic and event batches coexist', async () => {
    const eventBatchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae';
    const eventBatchKey = 'event:atlanta-shoe-market-2026-08';
    const sql = vi.fn(async (query) => {
      if (query === repository.PREFERRED_TODAY_BATCH_SQL) {
        return [{
          id: eventBatchId, batch_key: eventBatchKey, business_date: '2026-08-11',
          target_count: 70, status: 'ready', discovered_count: 105, new_prospect_count: 70,
          qualified_count: 70, message_ready_count: 70, mockup_ready_count: 70,
          started_at: '2026-08-11T08:00:00Z', ready_at: '2026-08-11T11:00:00Z',
          last_error_code: null, run_metadata: { eventKey: 'atlanta-shoe-market-2026-08' },
          updated_at: '2026-08-11T11:00:00Z',
        }];
      }
      if (query.includes('COUNT(*)::integer AS total')) return [{ total: 0 }];
      if (query.includes('manual_attempted_count')) return [];
      if (query.includes('jsonb_agg')) return [{ events: [], sources: [], industries: [] }];
      return [];
    });

    const result = await repository.listManualReviewLeads(sql, { reviewView: 'today' });
    const listQuery = sql.mock.calls[0][0];
    const countQuery = sql.mock.calls[1][0];
    const optionQuery = sql.mock.calls[3][0];
    const summaryQuery = sql.mock.calls[4][0];

    for (const query of [listQuery, countQuery, optionQuery]) {
      expect(query).toContain('preferred_today_batch AS');
      expect(query).toContain("batch_key LIKE 'event:%'");
      expect(query).toContain("batch_key='generic'");
      expect(query).toContain('morning_batch_id=(SELECT id FROM preferred_today_batch)');
    }
    expect(listQuery).not.toContain("imported_business_date=(NOW() AT TIME ZONE 'America/New_York')::date");
    expect(summaryQuery).toBe(repository.PREFERRED_TODAY_BATCH_SQL);
    expect(summaryQuery).toContain("ORDER BY CASE WHEN batch_key LIKE 'event:%' THEN 0 ELSE 1 END,updated_at DESC,id");
    expect(result.morningBatch).toMatchObject({ id: eventBatchId, batchKey: eventBatchKey, status: 'ready' });
  });

  it('adds only isolated review and manual counter objects with fail-closed defaults', () => {
    expect(migration29).toContain('CREATE TABLE IF NOT EXISTS outbound_manual_lead_reviews');
    expect(migration29).toContain("DEFAULT 'pending'");
    expect(migration29).toContain("permission_status = 'explicit_opt_in'");
    expect(migration29).toContain("DEFAULT 'not_sent'");
    expect(migration29).toContain('manual_attempted_count');
    expect(migration29).toContain('manual_sent_count');
    expect(migration29).not.toMatch(/\b(?:orders|customers|profiles|payments)\b/i);
    expect(migration29).not.toContain('CASCADE');
    expect(rollback29).toContain('DROP TABLE IF EXISTS outbound_manual_lead_reviews');
    expect(migration30).toContain("'admin_authorized'");
    expect(migration30).toContain('authenticated Send click');
    expect(rollback30).toContain("permission_status = 'admin_authorized'");
    expect(MAX_MANUAL_DAILY_ATTEMPTS).toBe(70);
  });

  it('ranks direct trade-show evidence and blocks anything not technically ready', () => {
    const lead = mapLead(rowFixture());
    expect(lead).toMatchObject({
      eventFit: { priority: 'trade_show', label: 'Trade show / expo evidence' },
      mockup: { presentationReady: true },
      canSend: true,
      technicalBlockers: [],
      technicalWarnings: ['Role inbox — verify this public company mailbox during manual qualification before sending'],
    });
    const suppressed = mapLead({ ...rowFixture(), active_suppression: true });
    expect(suppressed.canSend).toBe(false);
    expect(suppressed.technicalBlockers).toContain('Active opt-out or delivery suppression');
    const missingUpload = mapLead({
      ...rowFixture(),
      mockup_id: null,
      mockup_status: null,
      mockup_quality_level: null,
      mockup_generation_metadata: null,
    });
    expect(missingUpload.canSend).toBe(false);
    expect(missingUpload.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    expect(missingUpload.mockup).toBeNull();
    const failed = mapLead({
      ...rowFixture(),
      mockup_status: 'failed',
      mockup_quality_level: 'name_only',
      mockup_last_error_code: 'WEBSITE_TIMEOUT',
      mockup_updated_at: '2026-08-11T15:00:00.000Z',
    });
    expect(failed.canSend).toBe(false);
    expect(failed.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    expect(failed.mockup).toMatchObject({
      status: 'failed', lastErrorCode: 'WEBSITE_TIMEOUT',
      updatedAt: '2026-08-11T15:00:00.000Z', previewUrl: null,
    });
    const unsafeImageAudit = mapLead({
      ...rowFixture(),
      mockup_generation_metadata: {
        ...rowFixture().mockup_generation_metadata,
        imageAudit: { passed: false, format: 'jpeg', width: 1200, height: 675 },
      },
    });
    expect(unsafeImageAudit.canSend).toBe(false);
    expect(unsafeImageAudit.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    const mutablePreview = mapLead({
      ...rowFixture(),
      mockup_generation_metadata: {
        ...rowFixture().mockup_generation_metadata,
        blobBindingAudit: null,
      },
    });
    expect(mutablePreview.canSend).toBe(false);
    expect(mutablePreview.mockup.immutablePreviewReady).toBe(false);
    expect(mutablePreview.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    const staleContext = mapLead({
      ...rowFixture(),
      message_content_hash: 'd'.repeat(64),
    });
    expect(staleContext.canSend).toBe(false);
    expect(staleContext.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    const staleRenderer = mapLead({
      ...rowFixture(),
      mockup_render_version: 'company-banner-v11-clean-assets-adaptive-layouts',
    });
    expect(staleRenderer.canSend).toBe(false);
    expect(staleRenderer.mockup.presentationReady).toBe(false);
    expect(staleRenderer.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    const partialAudit = rowFixture();
    delete partialAudit.mockup_generation_metadata.manualReviewAudit;
    const partialLead = mapLead(partialAudit);
    expect(partialLead.canSend).toBe(false);
    expect(partialLead.mockup.presentationReady).toBe(false);
    expect(partialLead.technicalBlockers).toContain('Upload and review a banner design for this company before sending');
    const wrongDimensions = rowFixture();
    wrongDimensions.mockup_generation_metadata.imageAudit.width = 1199;
    const wrongDimensionsLead = mapLead(wrongDimensions);
    expect(wrongDimensionsLead.canSend).toBe(false);
    expect(wrongDimensionsLead.mockup.presentationReady).toBe(false);
  });

  it('fails closed when the selected contact differs from the initial message contact, while accepting the matched pair', () => {
    const contactBWithContactAEmail = mapLead({
      ...rowFixture(),
      contact_id: CONTACT_B_ID,
      contact_email: 'casey@futureexpo.example',
      message_contact_id: CONTACT_ID,
    });
    expect(contactBWithContactAEmail.canSend).toBe(false);
    expect(contactBWithContactAEmail.technicalBlockers).toContain('Email draft is not addressed to the selected contact');

    const contactBWithOwnEmail = mapLead({
      ...rowFixture(),
      contact_id: CONTACT_B_ID,
      contact_email: 'casey@futureexpo.example',
      message_contact_id: CONTACT_B_ID,
    });
    expect(contactBWithOwnEmail.canSend).toBe(true);
    expect(contactBWithOwnEmail.technicalBlockers).not.toContain('Email draft is not addressed to the selected contact');
  });

  it.each(MANUAL_ROLE_LOCAL_PARTS)('allows %s@ only as a warned manual single-send contact', (localPart) => {
    const email = `${localPart}@futureexpo.example`;
    const lead = mapLead({
      ...rowFixture(),
      contact_email: email,
      is_role_address: true,
      verification_status: 'risky',
    });
    expect(isAllowedManualRoleInbox(email)).toBe(true);
    expect(lead.canSend).toBe(true);
    expect(lead.technicalBlockers).toEqual([]);
    expect(lead.technicalWarnings).toEqual([
      'Role inbox — verify this public company mailbox during manual qualification before sending',
    ]);
  });

  it.each(['admin', 'billing', 'bookings', 'jobs', 'mail', 'press', 'webmaster'])(
    'keeps operational role inbox %s@ blocked',
    (localPart) => {
      const lead = mapLead({
        ...rowFixture(),
        contact_email: `${localPart}@futureexpo.example`,
        is_role_address: true,
        verification_status: 'risky',
      });
      expect(lead.canSend).toBe(false);
      expect(lead.technicalWarnings).toEqual([]);
      expect(lead.technicalBlockers).toContain('Role-based mailbox is not eligible for manual sending');
    },
  );

  it('requires live MX, company-domain match, and a non-free mailbox for the manual role exception', () => {
    const valid = {
      email: 'info@futureexpo.example', emailNormalized: 'info@futureexpo.example',
      syntaxValid: true, mxStatus: 'present', isRoleAddress: true,
      isFreeMailbox: false, domainMatches: true,
    };
    expect(isManualSingleSendAssessmentEligible(valid)).toBe(true);
    expect(isManualSingleSendAssessmentEligible({ ...valid, email: 'admin@futureexpo.example', emailNormalized: 'admin@futureexpo.example' })).toBe(false);
    expect(isManualSingleSendAssessmentEligible({ ...valid, mxStatus: 'not_checked' })).toBe(false);
    expect(isManualSingleSendAssessmentEligible({ ...valid, mxStatus: 'missing' })).toBe(false);
    expect(isManualSingleSendAssessmentEligible({ ...valid, isFreeMailbox: true })).toBe(false);
    expect(isManualSingleSendAssessmentEligible({ ...valid, domainMatches: false })).toBe(false);
    expect(isManualSingleSendAssessmentEligible({ ...valid, syntaxValid: false })).toBe(false);
  });

  it('accepts a verified parenthetical brand alias without weakening cross-company protection', () => {
    const brandedRow = {
      ...rowFixture(),
      business_name: 'Evolutions Brands (BED|STÜ)',
      message_subject: 'Fresh booth signage for BED|STÜ at Atlanta Shoe Market',
      message_body_text: 'Hi Jason,\n\nI saw BED|STÜ is exhibiting at the Atlanta Shoe Market.\n\nBest,\nBrandon',
    };
    expect(mapLead(brandedRow)).toMatchObject({ canSend: true, technicalBlockers: [] });
    expect(messageMatchesCompanyIdentity({
      businessName: brandedRow.business_name,
      subject: brandedRow.message_subject,
      bodyText: brandedRow.message_body_text,
    })).toBe(true);

    expect(mapLead({
      ...brandedRow,
      message_subject: 'Help Be Lenka stand out at Atlanta Shoe Market',
      message_body_text: 'Hi Katarína,\n\nI saw Be Lenka is exhibiting at the Atlanta Shoe Market.',
    }).technicalBlockers).toContain('Email company-name personalization does not match this lead');
  });

  it('shows the same deduplicated offer copy in the admin card that delivery will render', () => {
    const lead = mapLead({
      ...rowFixture(),
      message_body_text: 'Hi Taylor,\n\nFuture Expo Group is preparing for an event.\n\nFor your first order, use code NEW20 to save 20%. Use code NEW20 to save 20% on your first order whenever you’re ready.\n\nBest,\nBrandon\nBanners On The Fly',
    });
    expect(lead.message.bodyText.match(/Use code NEW20/g)).toHaveLength(1);
    expect(lead.message.bodyText).toContain('Brandon Schaefer\nOwner, Banners On The Fly');
  });

  it('reserves a discovery slot for trade-show and event prospects until outcome learning takes over', () => {
    const keywords = selectProspectingKeywords([], { seed: '2026-08-10', limit: 3 });
    expect(keywords).toHaveLength(3);
    expect(EVENT_FIRST_INDUSTRY_KEYWORDS).toContain(keywords[0]);
    expect(keywords).toEqual(selectProspectingKeywords([], { seed: '2026-08-10', limit: 3 }));
  });

  it('keeps fresh processing locked and permits only an expired unsent processing lease to be reclaimed', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    expect(manualSendRecoveryStatus({
      send_state: 'processing', send_started_at: '2026-08-11T11:50:01.000Z',
    }, now)).toBe('in_progress');
    expect(manualSendRecoveryStatus({
      send_state: 'processing', send_started_at: '2026-08-11T11:44:59.000Z',
    }, now)).toBe('retryable');
    expect(mapLead({
      ...rowFixture(), review_status: 'approved', permission_status: 'admin_authorized',
      send_state: 'processing', send_started_at: '2026-08-11T11:44:59.000Z',
    }).canSend).toBe(true);
    expect(MANUAL_SEND_LEASE_SECONDS).toBe(15 * 60);
  });

  it('never reclaims a processing row once any delivery evidence exists', () => {
    const row = {
      ...rowFixture(), send_state: 'processing', send_started_at: '2026-08-11T10:00:00.000Z',
      review_resend_message_id: 'resend-already-accepted',
    };
    const lead = mapLead(row);
    expect(manualSendRecoveryStatus(row, new Date('2026-08-11T12:00:00.000Z'))).toBe('delivery_recorded');
    expect(lead.canSend).toBe(false);
    expect(lead.technicalBlockers).toContain('A delivery record already exists; this email will not be sent again');
  });

  it('uses the existing idempotency key when reclaiming an expired processing lease without charging another attempt', async () => {
    const sql = vi.fn().mockResolvedValue([]);
    await repository.claimManualReviewSend(sql, {
      prospectId: PROSPECT_ID,
      businessDate: '2026-08-10',
      dailyLimit: 70,
      sendKey: stableManualSendKey(PROSPECT_ID),
      mockupContentHash: 'e'.repeat(64),
    });
    expect(sql.mock.calls[0][0]).toContain('COALESCE(review.send_key,$4)');
    expect(sql.mock.calls[0][0]).toContain("m.contact_id=contact.id");
    expect(sql.mock.calls[0][0]).toContain('message.contact_id=contact.id');
    expect(sql.mock.calls[0][0]).toContain("review.send_state='processing'");
    expect(sql.mock.calls[0][0]).toContain("NOW()-($6::integer * INTERVAL '1 second')");
    expect(sql.mock.calls[0][0]).toContain('SELECT $2,1 FROM candidate WHERE NOT candidate.is_reclaim');
    expect(sql.mock.calls[0][0]).toContain('CASE WHEN candidate.is_reclaim THEN 0 ELSE 1 END');
    expect(sql.mock.calls[0][0]).toContain('review.resend_message_id IS NULL AND review.sent_at IS NULL');
    expect(sql.mock.calls[0][0]).toContain('message.resend_message_id IS NULL AND message.sent_at IS NULL');
    expect(sql.mock.calls[0][1]).toEqual(expect.arrayContaining([stableManualSendKey(PROSPECT_ID), MANUAL_SEND_LEASE_SECONDS]));
    expect(sql.mock.calls[0][0]).toContain('JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id');
    expect(sql.mock.calls[0][0]).toContain("mockup.status='ready' AND mockup.quality_level='manual_upload'");
    expect(sql.mock.calls[0][0]).toContain('mockup.generation_metadata @>');
    expect(sql.mock.calls[0][0]).toContain("mockup.render_version='company-banner-manual-upload-v2'");
    expect(sql.mock.calls[0][0]).toContain('manual-company-banners/');
    expect(sql.mock.calls[0][0]).toContain('mockup.message_id=message.id AND mockup.content_hash=$5');
    expect(sql.mock.calls[0][0]).toContain("mockup.generation_metadata->>'messageContentHash'=message.content_hash");
    expect(sql.mock.calls[0][0]).toContain("contact.mx_status='present'");
    expect(sql.mock.calls[0][0]).toContain("SPLIT_PART(COALESCE(contact.email_normalized,''),'@',1)");
    expect(sql.mock.calls[0][0]).toContain('contact.is_free_mailbox=FALSE AND contact.domain_matches=TRUE');
    expect(sql.mock.calls[0][0]).toContain('p.first_contacted_at IS NULL AND p.prior_customer_match=FALSE AND p.suppression_reason IS NULL');
    expect(sql.mock.calls[0][0]).toContain('FROM outbound_suppressions suppression');
  });

  it('commits accepted sends against the partial provider-event unique index', async () => {
    const sql = vi.fn().mockResolvedValue([{ id: MESSAGE_ID, prospect_id: PROSPECT_ID }]);
    await repository.markManualReviewSent(sql, {
      prospectId: PROSPECT_ID,
      sendKey: stableManualSendKey(PROSPECT_ID),
      providerMessageId: 'resend-manual-1',
      latencyMs: 120,
      messageId: MESSAGE_ID,
      contactId: CONTACT_ID,
      businessDate: '2026-08-10',
    });
    expect(sql.mock.calls[0][0]).toContain(
      'ON CONFLICT (provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING',
    );
  });

});

describe('permissioned Resend transport', () => {
  it('cannot construct or call the transport without a direct admin authorization', async () => {
    const send = vi.fn();
    await expect(sendPermissionedMarketingMessage({
      permissionStatus: 'unknown', adminAuthorized: false,
      env: deliveryEnvironment, transport: { emails: { send } },
    })).rejects.toMatchObject({ code: 'PERMISSIONED_MARKETING_REQUIRED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('prevents duplicate provider delivery by reusing the same stable provider idempotency key', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'resend-manual-1' } });
    const result = await sendPermissionedMarketingMessage({
      permissionStatus: 'admin_authorized', adminAuthorized: true,
      env: deliveryEnvironment, transport: { emails: { send } },
      publicOrigin: 'https://bannersonthefly.com',
      unsubscribeUrl: 'https://bannersonthefly.com/.netlify/functions/outbound-sales-unsubscribe?token=opaque',
      from: 'Banners On The Fly <info@bannersonthefly.com>',
      replyTo: 'support@bannersonthefly.com',
      contact: { email: 'events@futureexpo.example' },
      message: {
        id: MESSAGE_ID,
        sendKey: stableManualSendKey(PROSPECT_ID),
        subject: 'Expo banners',
        bodyText: 'Text',
        bodyHtml: `<p><img src="${MOCKUP_PUBLIC_URL}">HTML</p>`,
      },
    });
    expect(result.providerMessageId).toBe('resend-manual-1');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'events@futureexpo.example',
      headers: {
        'List-Unsubscribe': '<https://bannersonthefly.com/.netlify/functions/outbound-sales-unsubscribe?token=opaque>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: expect.stringContaining(MOCKUP_PUBLIC_URL),
    }), { idempotencyKey: stableManualSendKey(PROSPECT_ID) });
    expect(send.mock.calls[0][0]).not.toHaveProperty('attachments');
  });

  it('requires a delivery key and resolves the complete compliance configuration before a claim is attempted', () => {
    expect(validateManualDeliveryConfiguration(deliveryEnvironment)).toMatchObject({ origin: 'https://bannersonthefly.com' });
    const withoutKey = {
      ...deliveryEnvironment,
      OUTBOUND_PERMISSIONED_RESEND_API_KEY: '',
      RESEND_API_KEY: '',
    };
    expect(() => validateManualDeliveryConfiguration(withoutKey)).toThrow(expect.objectContaining({
      code: 'MANUAL_MARKETING_NOT_CONFIGURED',
      deliveryIssues: ['Resend API key'],
    }));
    expect(deliveryStatus(withoutKey)).toEqual({ deliveryReady: false, deliveryIssues: ['Resend API key'], manualSendEnabled: true });
  });

  it('requires explicit manual-send opt-in while allowing an intentionally enabled deploy preview', () => {
    expect(deliveryStatus({ ...deliveryEnvironment, OUTBOUND_MANUAL_SEND_ENABLED: '' })).toEqual({
      deliveryReady: false, deliveryIssues: ['manual-send opt-in'], manualSendEnabled: false,
    });
    expect(deliveryStatus({
      ...deliveryEnvironment, CONTEXT: 'deploy-preview', DEPLOY_PRIME_URL: 'https://preview.example',
    })).toMatchObject({ deliveryReady: true, manualSendEnabled: true });
  });

  it('can reuse the existing site Resend key without weakening admin authorization checks', () => {
    const sharedKeyEnvironment = {
      ...deliveryEnvironment,
      OUTBOUND_PERMISSIONED_RESEND_API_KEY: '',
      RESEND_API_KEY: 're_existing_site_key_for_permissioned_send',
    };
    expect(validateManualDeliveryConfiguration(sharedKeyEnvironment)).toMatchObject({ origin: 'https://bannersonthefly.com' });
  });

  it('reuses the existing site email settings and derives a domain-separated unsubscribe key', () => {
    const existingSiteEnvironment = {
      RESEND_API_KEY: 're_existing_site_key_for_permissioned_send',
      EMAIL_FROM_INFO: 'Banners On The Fly <info@bannersonthefly.com>',
      EMAIL_REPLY_TO: 'support@bannersonthefly.com',
      AUTH_SESSION_SECRET: 'existing-admin-session-secret-at-least-32-characters',
      SITE_URL: 'https://bannersonthefly.com',
    };
    expect(validateManualDeliveryConfiguration(existingSiteEnvironment)).toEqual({
      origin: 'https://bannersonthefly.com',
      from: 'Banners On The Fly <info@bannersonthefly.com>',
      replyTo: 'support@bannersonthefly.com',
      physicalAddress: 'PO Box 369, Crestwood, KY 40014',
    });
    expect(resolveUnsubscribeSigningSecret(existingSiteEnvironment)).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveUnsubscribeSigningSecret(existingSiteEnvironment)).toBe(resolveUnsubscribeSigningSecret(existingSiteEnvironment));
  });
});

describe('manual lead review endpoint', () => {
  it('uses the Send click as authorization, verifies the email, sends once, and commits it', async () => {
    const claimed = {
      prospect_id: PROSPECT_ID, contact_id: CONTACT_ID, message_id: MESSAGE_ID, message_contact_id: CONTACT_ID,
      send_key: stableManualSendKey(PROSPECT_ID), send_attempt_count: 1,
      business_name: 'Future Expo Group', prospect_status: 'ready_for_outreach',
      email: 'info@futureexpo.example', campaign_id: null,
      subject: 'Future Expo Group: banner planning for your exhibitor expo',
      body_text: 'Hi Taylor,\n\nI saw Future Expo Group has an upcoming exhibitor expo.\n\nBest,\nBrandon\nBanners On The Fly',
      generation_status: 'generated', evidence_validation_status: 'passed',
    };
    const sendPermissioned = vi.fn().mockImplementation(async (input) => {
      expect(input.adminAuthorized).toBe(true);
      expect(input.permissionStatus).toBe('admin_authorized');
      expect(input.message.bodyText).toContain('NEW20');
      expect(input.message.bodyText).toContain('Unsubscribe: https://bannersonthefly.com/.netlify/functions/outbound-sales-unsubscribe?token=');
      expect(input.message.bodyHtml).toContain('Unsubscribe from future marketing emails');
      expect(input.message.bodyHtml).toContain(deliveryAsset('f'.repeat(64)).secureUrl);
      expect(input.message.bodyHtml).not.toContain('cid:');
      expect(input.message.bodyHtml).toContain('Concept visualization only.');
      expect(input.message.bodyHtml).not.toMatch(/quick mockup|complimentary/i);
      expect(input.attachments).toBeUndefined();
      return { providerMessageId: 'resend-manual-2', latencyMs: 12 };
    });
    const saveToken = vi.fn().mockResolvedValue({ id: 'token-row' });
    const markSent = vi.fn().mockResolvedValue({ id: MESSAGE_ID, prospect_id: PROSPECT_ID });
    const appendAudit = vi.fn().mockResolvedValue({ id: 2 });
    const authorizeManualSend = vi.fn().mockResolvedValue({
      prospect_id: PROSPECT_ID, review_status: 'approved', permission_status: 'admin_authorized', send_state: 'not_sent',
    });
    const assessEmail = vi.fn().mockResolvedValue({
      email: 'info@futureexpo.example', emailNormalized: 'info@futureexpo.example',
      syntaxValid: true, isRoleAddress: true, isFreeMailbox: false, domainMatches: true,
      mxStatus: 'present', mxCheckedAt: '2026-08-10T12:00:00.000Z',
      verificationStatus: 'risky', verificationReason: 'Role mailbox with syntax and MX confirmed.', contactQualityScore: 85,
    });
    const claimManualReviewSend = vi.fn().mockResolvedValue(claimed);
    const mockupContentHash = 'f'.repeat(64);
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}), claimManualReviewSend,
        saveUnsubscribeToken: saveToken, sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewSent: markSent, markManualReviewFailed: vi.fn(), appendAudit,
        authorizeManualSend,
        loadManualReviewContact: vi.fn().mockResolvedValue({
          id: CONTACT_ID, email: 'info@futureexpo.example', canonical_domain: 'futureexpo.example',
        }),
        assessEmail, saveManualContactAssessment: vi.fn().mockResolvedValue({ id: CONTACT_ID }),
        loadVerifiedManualArtwork: vi.fn().mockResolvedValue(verifiedArtwork({ contentHash: mockupContentHash })),
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, duplicate: false, messageId: 'resend-manual-2' });
    expect(saveToken).toHaveBeenCalledOnce();
    expect(authorizeManualSend).toHaveBeenCalledWith({}, { prospectId: PROSPECT_ID, reviewedBy: 'admin@bannersonthefly.com' });
    expect(assessEmail).toHaveBeenCalledOnce();
    expect(claimManualReviewSend).toHaveBeenCalledWith({}, expect.objectContaining({ mockupContentHash }));
    expect(markSent).toHaveBeenCalledWith({}, expect.objectContaining({ providerMessageId: 'resend-manual-2' }));
    expect(appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({
      action: 'manual_lead.send_authorized',
      metadata: expect.objectContaining({ manualRoleInbox: true, emailMxStatus: 'present' }),
    }));
    expect(appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({ action: 'manual_lead.email_sent' }));
  });

  it('fails closed before transport if a claimed contact B is paired with contact A’s draft', async () => {
    const sendPermissionedMarketingMessage = vi.fn();
    const markManualReviewFailed = vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID });
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}),
        appendAudit: vi.fn().mockResolvedValue({}),
        authorizeManualSend: vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID }),
        loadManualReviewContact: vi.fn().mockResolvedValue({
          id: CONTACT_B_ID, email: 'casey@futureexpo.example', canonical_domain: 'futureexpo.example',
        }),
        assessEmail: vi.fn().mockResolvedValue({
          email: 'casey@futureexpo.example', emailNormalized: 'casey@futureexpo.example',
          syntaxValid: true, isRoleAddress: false, isFreeMailbox: false, domainMatches: true,
          mxStatus: 'present', verificationStatus: 'valid', contactQualityScore: 100,
        }),
        saveManualContactAssessment: vi.fn().mockResolvedValue({ id: CONTACT_B_ID }),
        loadVerifiedManualArtwork: vi.fn().mockResolvedValue(verifiedArtwork()),
        claimManualReviewSend: vi.fn().mockResolvedValue({
          prospect_id: PROSPECT_ID, contact_id: CONTACT_B_ID, message_id: MESSAGE_ID,
          message_contact_id: CONTACT_ID, send_key: stableManualSendKey(PROSPECT_ID),
          business_name: 'Future Expo Group', email: 'casey@futureexpo.example',
          subject: 'Future Expo Group: banner planning', body_text: 'Hi Taylor,',
        }),
        markManualReviewFailed,
        saveUnsubscribeToken: vi.fn(),
        sendPermissionedMarketingMessage,
      },
    });

    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'MANUAL_MARKETING_CONTACT_MISMATCH' });
    expect(sendPermissionedMarketingMessage).not.toHaveBeenCalled();
    expect(markManualReviewFailed).toHaveBeenCalledWith({}, expect.objectContaining({
      prospectId: PROSPECT_ID, sendKey: stableManualSendKey(PROSPECT_ID),
      errorCode: 'MANUAL_MARKETING_CONTACT_MISMATCH',
    }));
  });

  it('rejects a non-customer-facing role alias before authorization, artwork loading, claim, or transport', async () => {
    const authorizeManualSend = vi.fn();
    const loadVerifiedManualArtwork = vi.fn();
    const claimManualReviewSend = vi.fn();
    const sendPermissionedMarketingMessage = vi.fn();
    const saveManualContactAssessment = vi.fn().mockResolvedValue({ id: CONTACT_ID });
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}),
        loadManualReviewContact: vi.fn().mockResolvedValue({
          id: CONTACT_ID, email: 'admin@futureexpo.example', canonical_domain: 'futureexpo.example',
        }),
        assessEmail: vi.fn().mockResolvedValue({
          email: 'admin@futureexpo.example', emailNormalized: 'admin@futureexpo.example',
          syntaxValid: true, isRoleAddress: true, isFreeMailbox: false, domainMatches: true,
          mxStatus: 'present', mxCheckedAt: '2026-08-10T12:00:00.000Z',
          verificationStatus: 'risky', contactQualityScore: 85,
        }),
        saveManualContactAssessment,
        authorizeManualSend,
        loadVerifiedManualArtwork,
        claimManualReviewSend,
        sendPermissionedMarketingMessage,
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'MANUAL_MARKETING_NOT_ELIGIBLE' });
    expect(saveManualContactAssessment).toHaveBeenCalledOnce();
    expect(authorizeManualSend).not.toHaveBeenCalled();
    expect(loadVerifiedManualArtwork).not.toHaveBeenCalled();
    expect(claimManualReviewSend).not.toHaveBeenCalled();
    expect(sendPermissionedMarketingMessage).not.toHaveBeenCalled();
  });

  it('fails closed before transport when no reviewed manual upload exists', async () => {
    const sendPermissioned = vi.fn();
    const markFailed = vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID });
    const claimManualReviewSend = vi.fn();
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}),
        loadManualReviewContact: vi.fn().mockResolvedValue({ id: CONTACT_ID, email: 'taylor@futureexpo.example', canonical_domain: 'futureexpo.example' }),
        assessEmail: vi.fn().mockResolvedValue({
          email: 'taylor@futureexpo.example', emailNormalized: 'taylor@futureexpo.example', syntaxValid: true,
          isRoleAddress: false, isFreeMailbox: false, domainMatches: true, mxStatus: 'present',
          verificationStatus: 'valid', contactQualityScore: 100,
        }),
        saveManualContactAssessment: vi.fn().mockResolvedValue({ id: CONTACT_ID }),
        authorizeManualSend: vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID }),
        appendAudit: vi.fn().mockResolvedValue({}),
        claimManualReviewSend,
        saveUnsubscribeToken: vi.fn().mockResolvedValue({}),
        loadVerifiedManualArtwork: vi.fn().mockRejectedValue(Object.assign(
          new Error('Upload and review a banner image for this company before sending.'),
          { code: 'MANUAL_ARTWORK_NOT_READY' },
        )),
        sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewFailed: markFailed,
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'MANUAL_ARTWORK_NOT_READY' });
    expect(sendPermissioned).not.toHaveBeenCalled();
    expect(claimManualReviewSend).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('fails closed before transport when the uploaded artwork is not bound to the current draft', async () => {
    const sendPermissioned = vi.fn();
    const markFailed = vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID });
    const claimManualReviewSend = vi.fn();
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}),
        loadManualReviewContact: vi.fn().mockResolvedValue({ id: CONTACT_ID, email: 'taylor@futureexpo.example', canonical_domain: 'futureexpo.example' }),
        assessEmail: vi.fn().mockResolvedValue({
          email: 'taylor@futureexpo.example', emailNormalized: 'taylor@futureexpo.example', syntaxValid: true,
          isRoleAddress: false, isFreeMailbox: false, domainMatches: true, mxStatus: 'present',
          verificationStatus: 'valid', contactQualityScore: 100,
        }),
        saveManualContactAssessment: vi.fn().mockResolvedValue({ id: CONTACT_ID }),
        authorizeManualSend: vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID }),
        appendAudit: vi.fn().mockResolvedValue({}),
        claimManualReviewSend,
        saveUnsubscribeToken: vi.fn().mockResolvedValue({}),
        loadVerifiedManualArtwork: vi.fn().mockRejectedValue(Object.assign(
          new Error('The reviewed banner is stale for the current draft.'),
          { code: 'MANUAL_ARTWORK_NOT_READY' },
        )),
        sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewFailed: markFailed,
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'MANUAL_ARTWORK_NOT_READY' });
    expect(sendPermissioned).not.toHaveBeenCalled();
    expect(claimManualReviewSend).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('fails closed before transport if Company A is ever paired with Company B artwork data', async () => {
    const sendPermissioned = vi.fn();
    const markFailed = vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID });
    const claimed = {
      prospect_id: PROSPECT_ID, contact_id: CONTACT_ID, message_id: MESSAGE_ID,
      send_key: stableManualSendKey(PROSPECT_ID), business_name: 'Future Expo Group',
      email: 'taylor@futureexpo.example', subject: 'Future Expo Group custom banner concept',
      body_text: 'Hi Taylor,\n\nI made this Future Expo Group banner concept.\n\nBest,\nBrandon Schaefer\nOwner, Banners On The Fly\nbannersonthefly.com',
    };
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}),
        loadManualReviewContact: vi.fn().mockResolvedValue({ id: CONTACT_ID, email: 'taylor@futureexpo.example', canonical_domain: 'futureexpo.example' }),
        assessEmail: vi.fn().mockResolvedValue({
          email: 'taylor@futureexpo.example', emailNormalized: 'taylor@futureexpo.example', syntaxValid: true,
          isRoleAddress: false, isFreeMailbox: false, domainMatches: true, mxStatus: 'present',
          verificationStatus: 'valid', contactQualityScore: 100,
        }),
        saveManualContactAssessment: vi.fn().mockResolvedValue({ id: CONTACT_ID }),
        authorizeManualSend: vi.fn().mockResolvedValue({ prospect_id: PROSPECT_ID }),
        appendAudit: vi.fn().mockResolvedValue({}),
        claimManualReviewSend: vi.fn().mockResolvedValue(claimed),
        saveUnsubscribeToken: vi.fn().mockResolvedValue({}),
        loadVerifiedManualArtwork: vi.fn().mockResolvedValue(verifiedArtwork({
          prospectId: '99999999-9999-4999-8999-999999999999',
          buffer: Buffer.from('wrong-company-banner'),
        })),
        sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewFailed: markFailed,
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'MANUAL_ARTWORK_NOT_READY' });
    expect(sendPermissioned).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });
});
