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
} = repository;
const { EVENT_FIRST_INDUSTRY_KEYWORDS, selectProspectingKeywords } = strategy;

const originalEnvironment = { ...process.env };
const PROSPECT_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

const deliveryEnvironment = {
  DATABASE_URL: 'postgres://test.invalid/database',
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
    message_subject: 'Future Expo Group: banner planning for your exhibitor expo',
    message_body_text: 'Hi Taylor,\n\nI saw Future Expo Group has an upcoming exhibitor expo.\n\nBest,\nBrandon\nBanners On The Fly',
    message_body_html: '<html><body>Preview</body></html>',
    generation_status: 'generated',
    evidence_validation_status: 'passed',
    message_sent_at: null,
    mockup_id: '44444444-4444-4444-8444-444444444444',
    mockup_status: 'ready',
    mockup_scene_id: 'trade_show',
    mockup_quality_level: 'logo_and_product',
    mockup_logo_url: 'https://futureexpo.example/logo.png',
    mockup_product_image_url: 'https://futureexpo.example/expo.jpg',
    mockup_event_label: 'Future Expo',
    mockup_source_urls: ['https://futureexpo.example'],
    mockup_content_hash: 'fixture-content-hash',
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

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'manual-review-test-session-secret';
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('manual lead review migration and qualification', () => {
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
      canSend: true,
      technicalBlockers: [],
    });
    const suppressed = mapLead({ ...rowFixture(), active_suppression: true });
    expect(suppressed.canSend).toBe(false);
    expect(suppressed.technicalBlockers).toContain('Active opt-out or delivery suppression');
    const fallback = mapLead({
      ...rowFixture(),
      mockup_status: 'fallback',
      mockup_quality_level: 'name_only',
      mockup_generation_metadata: {
        assetDiagnostics: [{ stage: 'logo', hostname: 'futureexpo.example', code: 'MOCKUP_ASSET_LOW_QUALITY' }],
      },
    });
    expect(fallback.canSend).toBe(false);
    expect(fallback.technicalBlockers).toContain('Personalized banner needs a verified logo and relevant product/service image');
    expect(fallback.mockup.diagnostics).toEqual([
      { stage: 'logo', hostname: 'futureexpo.example', code: 'MOCKUP_ASSET_LOW_QUALITY' },
    ]);
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

  it('qualifies ambiguous claim columns against the manual review row', async () => {
    const sql = vi.fn().mockResolvedValue([]);
    await repository.claimManualReviewSend(sql, {
      prospectId: PROSPECT_ID,
      businessDate: '2026-08-10',
      dailyLimit: 70,
      sendKey: stableManualSendKey(PROSPECT_ID),
    });
    expect(sql.mock.calls[0][0]).toContain('COALESCE(review.send_key,$4)');
    expect(sql.mock.calls[0][0]).toContain('review.send_attempt_count+1');
    expect(sql.mock.calls[0][0]).toContain('JOIN outbound_company_mockups mockup ON mockup.prospect_id=p.id');
    expect(sql.mock.calls[0][0]).toContain("mockup.status='ready' AND mockup.quality_level='logo_and_product'");
  });

  it('commits accepted sends against the partial provider-event unique index', async () => {
    const sql = vi.fn().mockResolvedValue([{ id: MESSAGE_ID, prospect_id: PROSPECT_ID }]);
    await repository.markManualReviewSent(sql, {
      prospectId: PROSPECT_ID,
      sendKey: stableManualSendKey(PROSPECT_ID),
      providerMessageId: 'resend-manual-1',
      latencyMs: 120,
      messageId: MESSAGE_ID,
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

  it('adds one-click unsubscribe and uses a stable provider idempotency key', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'resend-manual-1' } });
    const result = await sendPermissionedMarketingMessage({
      permissionStatus: 'admin_authorized', adminAuthorized: true,
      env: deliveryEnvironment, transport: { emails: { send } },
      publicOrigin: 'https://bannersonthefly.com',
      unsubscribeUrl: 'https://bannersonthefly.com/.netlify/functions/outbound-sales-unsubscribe?token=opaque',
      from: 'Banners On The Fly <info@bannersonthefly.com>',
      replyTo: 'support@bannersonthefly.com',
      contact: { email: 'events@futureexpo.example' },
      message: { id: MESSAGE_ID, sendKey: stableManualSendKey(PROSPECT_ID), subject: 'Expo banners', bodyText: 'Text', bodyHtml: '<p><img src="cid:company-banner-mockup">HTML</p>' },
      attachments: [{
        content: Buffer.from('email-safe-jpeg-fixture').toString('base64'),
        filename: 'future-expo-banner-concept.jpg',
        contentId: 'company-banner-mockup',
        contentType: 'image/jpeg',
      }],
    });
    expect(result.providerMessageId).toBe('resend-manual-1');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'events@futureexpo.example',
      headers: {
        'List-Unsubscribe': '<https://bannersonthefly.com/.netlify/functions/outbound-sales-unsubscribe?token=opaque>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      attachments: [expect.objectContaining({
        filename: 'future-expo-banner-concept.jpg',
        contentId: 'company-banner-mockup',
        contentType: 'image/jpeg',
      })],
    }), { idempotencyKey: stableManualSendKey(PROSPECT_ID) });
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
    expect(deliveryStatus(withoutKey)).toEqual({ deliveryReady: false, deliveryIssues: ['Resend API key'] });
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
      prospect_id: PROSPECT_ID, contact_id: CONTACT_ID, message_id: MESSAGE_ID,
      send_key: stableManualSendKey(PROSPECT_ID), send_attempt_count: 1,
      business_name: 'Future Expo Group', prospect_status: 'ready_for_outreach',
      email: 'events@futureexpo.example', campaign_id: null,
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
      expect(input.message.bodyHtml).toContain('cid:company-banner-mockup');
      expect(input.message.bodyHtml).toContain('A complimentary banner concept created for Future Expo Group');
      expect(input.attachments).toEqual([expect.objectContaining({
        filename: 'future-expo-group-banner-concept.jpg',
        contentId: 'company-banner-mockup',
        contentType: 'image/jpeg',
      })]);
      return { providerMessageId: 'resend-manual-2', latencyMs: 12 };
    });
    const saveToken = vi.fn().mockResolvedValue({ id: 'token-row' });
    const markSent = vi.fn().mockResolvedValue({ id: MESSAGE_ID, prospect_id: PROSPECT_ID });
    const appendAudit = vi.fn().mockResolvedValue({ id: 2 });
    const authorizeManualSend = vi.fn().mockResolvedValue({
      prospect_id: PROSPECT_ID, review_status: 'approved', permission_status: 'admin_authorized', send_state: 'not_sent',
    });
    const assessEmail = vi.fn().mockResolvedValue({
      email: 'events@futureexpo.example', emailNormalized: 'events@futureexpo.example',
      syntaxValid: true, isRoleAddress: false, isFreeMailbox: false, domainMatches: true,
      mxStatus: 'present', mxCheckedAt: '2026-08-10T12:00:00.000Z',
      verificationStatus: 'valid', verificationReason: 'Syntax and MX are valid.', contactQualityScore: 100,
    });
    const handler = createManualReviewHandler({
      env: deliveryEnvironment,
      dependencies: {
        createSql: () => ({}), claimManualReviewSend: vi.fn().mockResolvedValue(claimed),
        saveUnsubscribeToken: saveToken, sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewSent: markSent, markManualReviewFailed: vi.fn(), appendAudit,
        authorizeManualSend,
        loadManualReviewContact: vi.fn().mockResolvedValue({
          id: CONTACT_ID, email: 'events@futureexpo.example', canonical_domain: 'futureexpo.example',
        }),
        assessEmail, saveManualContactAssessment: vi.fn().mockResolvedValue({ id: CONTACT_ID }),
        prepareCompanyMockup: vi.fn().mockResolvedValue({
          prospectId: PROSPECT_ID,
          buffer: Buffer.from('rendered-company-banner'),
          qualityLevel: 'logo_and_product',
          sendReady: true,
        }),
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, duplicate: false, messageId: 'resend-manual-2' });
    expect(saveToken).toHaveBeenCalledOnce();
    expect(authorizeManualSend).toHaveBeenCalledWith({}, { prospectId: PROSPECT_ID, reviewedBy: 'admin@bannersonthefly.com' });
    expect(assessEmail).toHaveBeenCalledOnce();
    expect(markSent).toHaveBeenCalledWith({}, expect.objectContaining({ providerMessageId: 'resend-manual-2' }));
    expect(appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({ action: 'manual_lead.send_authorized' }));
    expect(appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({ action: 'manual_lead.email_sent' }));
  });

  it('fails closed before transport when only the name-only fallback exists', async () => {
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
        prepareCompanyMockup: vi.fn().mockResolvedValue({
          prospectId: PROSPECT_ID,
          buffer: Buffer.from('generic-name-only-banner'),
          qualityLevel: 'name_only',
          sendReady: false,
        }),
        sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewFailed: markFailed,
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'COMPANY_MOCKUP_BRAND_ASSETS_INCOMPLETE' });
    expect(sendPermissioned).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({}, expect.objectContaining({
      errorCode: 'COMPANY_MOCKUP_BRAND_ASSETS_INCOMPLETE',
    }));
  });

  it('fails closed before transport if Company A is ever paired with Company B mockup data', async () => {
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
        prepareCompanyMockup: vi.fn().mockResolvedValue({
          prospectId: '99999999-9999-4999-8999-999999999999',
          buffer: Buffer.from('wrong-company-banner'), qualityLevel: 'logo_and_product',
        }),
        sendPermissionedMarketingMessage: sendPermissioned,
        markManualReviewFailed: markFailed,
      },
    });
    const response = await handler(adminEvent('POST', { prospectId: PROSPECT_ID }));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'COMPANY_MOCKUP_IDENTITY_MISMATCH' });
    expect(sendPermissioned).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({}, expect.objectContaining({ prospectId: PROSPECT_ID, errorCode: 'COMPANY_MOCKUP_IDENTITY_MISMATCH' }));
  });
});
