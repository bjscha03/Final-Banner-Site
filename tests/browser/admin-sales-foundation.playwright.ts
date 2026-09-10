import { expect, test } from '@playwright/test';

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const VISUAL_QA_PROJECTS = new Set(['chromium-1440x900', 'chromium-pixel8-portrait']);

const routes = [
  { path: '/admin/sales', label: 'Dashboard', visibleText: 'Operational safeguards' },
  { path: '/admin/sales/prospects', label: 'Prospect Queue', visibleText: 'Prospect Queue & Personalized Previews' },
  { path: '/admin/sales/lead-review', label: 'Lead Review', visibleText: 'Lead Review' },
  { path: '/admin/sales/activity', label: 'Email Activity', visibleText: 'Personalized Outreach Previews' },
  { path: '/admin/sales/replies', label: 'Replies', visibleText: 'Replies' },
  { path: '/admin/sales/orders', label: 'Orders & Revenue', visibleText: 'Orders & Revenue Generated' },
  { path: '/admin/sales/performance', label: 'Performance', visibleText: 'Industry & Campaign Performance' },
  { path: '/admin/sales/costs', label: 'Cost Analytics', visibleText: 'Cost Analytics' },
  { path: '/admin/sales/errors', label: 'Error Logs', visibleText: 'Error Logs & Monitoring' },
  { path: '/admin/sales/settings', label: 'Settings', visibleText: 'Global controls' },
] as const;

const safeStatus = {
  ok: true,
  authorized: true,
  phase: 'production_ready_shadow_locked',
  schemaReady: true,
  databaseConfigured: true,
  databaseAvailable: true,
  controls: {
    mode: 'shadow',
    outboundSalesEnabled: true,
    shadowModeEnabled: true,
    shadowGenerationRequested: true,
    shadowGenerationAvailable: true,
    shadowGenerationEnabled: true,
    automationRequested: false,
    automationAvailable: false,
    automationEnabled: false,
    replyIngestionRequested: false,
    replyIngestionAvailable: false,
    replyIngestionEnabled: false,
    replyAIFallbackRequested: false,
    replyAIFallbackAvailable: false,
    replyAIFallbackEnabled: false,
    automaticRepliesEnabled: false,
    liveSendingRequested: false,
    liveSendingAvailable: false,
    liveSendingEnabled: false,
    emergencyPaused: false,
    dailySendLimit: 30,
    monthlyOpenAIBudgetCents: 800,
    openAIProjectLimitRecommendationCents: 1000,
  },
  settings: {
    shadowModeEnabled: true,
    shadowGenerationEnabled: true,
    liveSendingEnabled: false,
    emergencyPaused: false,
    dailySendLimit: 30,
    monthlyOpenAIBudgetCents: 800,
    openAIProjectLimitRecommendationCents: 1000,
    monthlyProviderBudgetCents: 0,
    replyIngestionEnabled: false,
    replyAIFallbackEnabled: false,
    suggestedReplyGenerationEnabled: false,
    automationEnabled: false,
    deliveryWebhookEnabled: false,
    attributionEnabled: true,
    learningEnabled: true,
    monitoringEnabled: true,
    minimumLearningSample: 60,
    explorationPercent: 15,
    sendingWindowStartLocal: '09:30:00',
    sendingWindowEndLocal: '16:30:00',
    minimumSpacingSeconds: 600,
    maximumBounceRate: 0.05,
    maximumComplaintRate: 0.001,
    maximumErrorRate: 0.1,
    businessTimezone: 'America/New_York',
    settingsVersion: 1,
  },
  secretStatus: { openAI: true, resend: false, resendWebhook: false, unsubscribeSigning: false, automation: false, deliveryIdentity: false, emailVerification: false, apolloDiscovery: false },
  providers: [
    { id: 'google_places', displayName: 'Google Places', kind: 'discovery', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, executionScope: 'not_installed', executionAllowed: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
    { id: 'apollo', displayName: 'Apollo', kind: 'discovery', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: true, executionScope: 'test_staging_only', executionAllowed: true, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
    { id: 'email_verification', displayName: 'Email verification provider', kind: 'email_verification', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, executionScope: 'not_installed', executionAllowed: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
  ],
  metrics: {
    prospectsTotal: 0,
    readyForOutreach: 0,
    messagesTotal: 1,
    messagesGenerated: 1,
    messagesSent: 0,
    repliesTotal: 0,
    attributedOrders: 0,
    revenueGeneratedCents: 0,
    activeJobs: 0,
    deadJobs: 0,
  },
  monthlyCostsMicrousd: { openAI: 0, discovery: 0, emailVerification: 0, resend: 0 },
  safeguards: {
    providerExecutionInstalled: true,
    providerExecutionProductionBlocked: true,
    openAICallsInstalled: true,
    openAIExecutionScope: 'test_staging_only',
    openAIExecutionProductionBlocked: true,
    emailSendingInstalled: false,
    emailSendingProductionBlocked: true,
    emailSendingPolicyBlocked: true,
    scheduledAutomationInstalled: false,
    shadowAutomationInstalled: true,
    shadowAutomationProductionBlocked: true,
    inboundProcessingInstalled: true,
    inboundProcessingProductionBlocked: true,
    replyAIFallbackInstalled: true,
    replyAIFallbackProductionBlocked: true,
    automaticRepliesInstalled: false,
    liveSendingPhaseLocked: true,
  },
};

const shadowQueue = {
  ok: true,
  schemaReady: true,
  shadowMode: true,
  liveSending: false,
  total: 1,
  limit: 50,
  offset: 0,
  statusCounts: { ready_for_outreach: 1 },
  providerUsage: [{ providerId: 'apollo', operation: 'organization_search', requests: 1, results: 1, credits: 1, costMicrousd: 19600 }],
  prospects: [{
    id: '00000000-0000-0000-0000-000000000201',
    businessName: 'River City Community Sports',
    websiteUrl: 'https://rivercitysports.example/',
    canonicalDomain: 'rivercitysports.example',
    industry: 'Sports & Recreation',
    businessType: 'Community sports organization',
    locationCount: 2,
    status: 'ready_for_outreach',
    leadScore: 68,
    scoreBreakdown: { industry: 14, activity: 22, banner_need: 18, contact_quality: 8, website_freshness: 6 },
    scoreExplanation: [
      { factor: 'industry', points: 14, label: 'High-fit industry', detail: 'Community sports organizations regularly promote registrations, games, and sponsors.' },
      { factor: 'activity', points: 22, label: 'Upcoming activity', detail: 'Registration and summer tournament evidence appears on the public website.' },
      { factor: 'banner_need', points: 18, label: 'Visible print need', detail: 'Sponsor displays and event signage are mentioned on public pages.' },
      { factor: 'contact_quality', points: 8, label: 'Public business contact', detail: 'A syntax-valid, MX-backed address on the business domain was found.' },
      { factor: 'website_freshness', points: 6, label: 'Fresh website', detail: 'Current-season content is visible.' },
    ],
    qualificationEvidence: [{ code: 'UPCOMING_EVENT', sourceUrl: 'https://rivercitysports.example/events', evidence: 'Summer tournament registration' }],
    rejectionReason: null,
    suppressionReason: null,
    exclusionCodes: [],
    priorCustomerMatch: false,
    researchState: 'fetched',
    contactState: 'found',
    sourceProviderId: 'apollo',
    sourceUrls: ['https://rivercitysports.example/', 'https://rivercitysports.example/events'],
    researchFacts: { description: 'Community sports leagues, registrations, tournaments, and sponsor programs.' },
    researchCacheStatus: 'fresh',
    websiteFreshnessScore: 80,
    personalizationState: 'generated',
    personalizationFailureCode: null,
    lastPersonalizedAt: '2026-08-05T12:07:00.000Z',
    messagePreview: {
      id: '00000000-0000-0000-0000-000000000301',
      generationStatus: 'generated', promptVersion: 'outbound-personalization-v1', outputSchemaVersion: 'shadow-outreach-v1',
      researchContentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', model: 'gpt-5.4-mini-2026-03-17',
      subject: 'Banner planning for your summer tournament',
      bodyText: 'Hi River City Community Sports team,\n\nI saw that registration is open for your summer tournament and that sponsor visibility is part of your community program. Events like that often need clear, durable wayfinding and sponsor displays across several spaces.\n\nBanners On The Fly produces custom banners and printed displays, with most standard orders produced within 24 hours and free next-day air beginning after production. That can help when event details or sponsor artwork come together close to the tournament.\n\nWould it be helpful if I put together a quick quote based on the areas you need to cover?\n\nBest,\nBrandon\nBanners On The Fly',
      researchSummary: 'River City Community Sports publicly lists summer tournament registration and sponsor-display opportunities.',
      personalizationEvidence: [{ id: 'E1', evidence: 'Summer tournament registration and sponsor displays are listed publicly.', sourceUrl: 'https://rivercitysports.example/events' }],
      sourceUrls: ['https://rivercitysports.example/events'],
      variantAssignments: { subjectLineStyle: 'specific_observation', callToActionStyle: 'quick_quote_offer', emailLength: 'standard', offerFraming: 'quality_and_convenience', industryPositioning: 'evidence_specific', experimentState: 'shadow_observation_only' },
      recommendedFollowUpAt: '2026-08-10T12:07:00.000Z', estimatedOpenAICostMicrousd: 3100, actualOpenAICostMicrousd: 610,
      inputTokens: 920, cachedInputTokens: 0, outputTokens: 185, evidenceValidationStatus: 'passed', generationErrorCode: null,
      generatedAt: '2026-08-05T12:07:00.000Z',
    },
    primaryContact: {
      email: 'jordan@rivercitysports.example', sourceUrl: 'https://rivercitysports.example/contact',
      syntaxValid: true,
      verificationStatus: 'unverified', verificationReason: 'Syntax and MX are valid; mailbox-level verification is not installed.',
      mxStatus: 'present', isRoleAddress: false, isFreeMailbox: false, domainMatches: true,
      contactQualityScore: 85, sendEligible: false,
    },
    discoveredAt: '2026-08-05T12:00:00.000Z',
    lastResearchedAt: '2026-08-05T12:05:00.000Z',
    lastQualifiedAt: '2026-08-05T12:06:00.000Z',
  }],
};

const shadowActivity = {
  ok: true, schemaReady: true, shadowMode: true, liveSending: false,
  messages: [{
    ...shadowQueue.prospects[0].messagePreview,
    prospectId: shadowQueue.prospects[0].id,
    businessName: shadowQueue.prospects[0].businessName,
    industry: shadowQueue.prospects[0].industry,
    leadScore: shadowQueue.prospects[0].leadScore,
    prospectStatus: shadowQueue.prospects[0].status,
  }],
  total: 1, limit: 50, offset: 0,
  summary: { generated: 1, failed: 0, blocked: 0, actualCostMicrousd: 610, averageCostMicrousd: 610, inputTokens: 920, cachedInputTokens: 0, outputTokens: 185 },
};

const MANUAL_BANNER_PUBLIC_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v123/outbound-sales/manual-company-banners/11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg';
const MANUAL_BANNER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <rect width="1200" height="675" fill="#171717"/>
    <rect x="40" y="40" width="1120" height="595" rx="18" fill="#f26722"/>
    <text x="600" y="300" fill="#ffffff" font-size="116" font-family="Arial" font-weight="900" text-anchor="middle">LUGZ</text>
    <text x="600" y="410" fill="#171717" font-size="64" font-family="Arial" font-weight="800" text-anchor="middle">STEP IN GRIT.</text>
  </svg>
`;

function manualReviewQueue(uploaded: boolean, sent: boolean) {
  const previewBody = `<!doctype html><html><body><img src="${MANUAL_BANNER_PUBLIC_URL}" alt="Banner concept for Lugz"><p>Concept visualization only.</p><p>Hi Lugz team,</p></body></html>`;
  return {
    ok: true,
    schemaReady: true,
    deliveryReady: true,
    deliveryIssues: [],
    manualSendEnabled: true,
    total: 1,
    limit: 50,
    offset: 0,
    minimumScore: 60,
    reviewView: 'all',
    filters: {},
    sort: 'priority',
    counts: { pending: sent ? 0 : 1, approved: 0, rejected: 0, sent: sent ? 1 : 0 },
    mockups: { ready: uploaded ? 1 : 0, fallback: 0, missing: uploaded ? 0 : 1, failed: 0, retryableFailed: 0 },
    filterOptions: { events: ['Atlanta Shoe Market'], sources: ['event_import'], industries: ['Footwear'] },
    morningBatch: null,
    today: { attempted: sent ? 1 : 0, sent: sent ? 1 : 0, limit: 70 },
    leads: [{
      prospectId: '11111111-1111-4111-8111-111111111111',
      businessName: 'Lugz',
      websiteUrl: 'https://lugz.com',
      canonicalDomain: 'lugz.com',
      industry: 'Footwear',
      businessType: 'Footwear brand',
      phone: '212-555-0100',
      address: { city: 'New York', state: 'NY', country: 'US' },
      leadScore: 92,
      prospectStatus: sent ? 'contacted' : 'qualified',
      sourceProviderId: 'event_import',
      sourceUrl: 'https://example.test/atlanta-shoe-market/lugz',
      scoreExplanation: [],
      qualificationEvidence: [],
      eventFit: {
        priority: 'trade_show',
        label: 'Atlanta Shoe Market',
        eventName: 'Atlanta Shoe Market',
        evidence: [{
          code: 'TRADE_SHOW_EXHIBITOR',
          label: 'Atlanta Shoe Market exhibitor',
          evidence: 'Lugz appears on the official exhibitor list.',
          sourceUrl: 'https://example.test/atlanta-shoe-market/lugz',
        }],
      },
      contact: {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'sales@lugz.com',
        fullName: 'Lugz Sales Team',
        jobTitle: 'Sales',
        sourceUrl: 'https://lugz.com/contact',
        verificationStatus: 'verified',
        verificationReason: null,
        syntaxValid: true,
        mxStatus: 'present',
        isRoleAddress: true,
        isFreeMailbox: false,
        domainMatches: true,
        contactQualityScore: 94,
      },
      message: {
        id: '33333333-3333-4333-8333-333333333333',
        subject: 'Lugz — banners for Atlanta Shoe Market',
        bodyText: 'Hi Lugz team,\n\nI saw Lugz is exhibiting at Atlanta Shoe Market.\n\nBest,\nBrandon',
        bodyHtml: uploaded ? previewBody : '<!doctype html><html><body><p>Hi Lugz team,</p></body></html>',
        generationStatus: 'generated',
        evidenceValidationStatus: 'passed',
        sentAt: sent ? '2026-08-11T18:30:00.000Z' : null,
        deliveredAt: null,
        lastEventType: null,
        lastEventStatus: null,
        lastEventAt: null,
      },
      mockup: uploaded ? {
        id: '44444444-4444-4444-8444-444444444444',
        status: 'ready',
        sceneId: 'trade_show',
        renderVersion: 'manual-upload-v1',
        qualityLevel: 'manual_upload',
        logoUrl: null,
        productImageUrl: null,
        eventLabel: 'Atlanta Shoe Market',
        sourceUrls: [],
        diagnostics: [],
        compositionAudit: null,
        immutablePreviewReady: true,
        presentationReady: true,
        lastErrorCode: null,
        contextCurrent: true,
        generatedAt: '2026-08-11T18:25:00.000Z',
        updatedAt: '2026-08-11T18:25:00.000Z',
        previewUrl: MANUAL_BANNER_PUBLIC_URL,
      } : null,
      review: {
        status: 'pending',
        permissionStatus: sent ? 'admin_authorized' : 'unknown',
        permissionEvidence: '',
        notes: '',
        reviewedBy: sent ? 'outbound-phase3-qa@example.test' : null,
        reviewedAt: sent ? '2026-08-11T18:30:00.000Z' : null,
        sendState: sent ? 'sent' : 'not_sent',
        sendAttemptCount: sent ? 1 : 0,
        resendMessageId: sent ? 'mocked-resend-message-id' : null,
        lastSendErrorCode: null,
        sentAt: sent ? '2026-08-11T18:30:00.000Z' : null,
        sendStartedAt: null,
        sendLeaseExpiresAt: null,
        recoveryStatus: 'not_applicable',
      },
      technicalBlockers: uploaded ? [] : ['Upload and review a banner design for this company before sending'],
      technicalWarnings: ['Role inbox — verify this public company mailbox during manual qualification before sending'],
      canSend: uploaded && !sent,
      discoveredAt: '2026-08-11T12:00:00.000Z',
      importedBusinessDate: '2026-08-11',
      morningQueuePosition: 1,
      morningReadyAt: '2026-08-11T12:15:00.000Z',
      lastQualifiedAt: '2026-08-11T12:10:00.000Z',
    }],
  };
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!VISUAL_QA_PROJECTS.has(testInfo.project.name), 'Desktop and phone coverage are sufficient for the completed Shadow Mode admin shell.');
  await page.addInitScript(() => {
    const admin = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'outbound-phase3-qa@example.test',
      is_admin: true,
    };
    window.localStorage.setItem('banners_current_user', JSON.stringify(admin));
    window.localStorage.setItem('banners_server_session', 'outbound-phase3-browser-contract');
    window.sessionStorage.setItem('banners_server_session', 'outbound-phase3-browser-contract');
  });
  let manualBannerUploaded = false;
  let manualEmailSent = false;
  await page.route(MANUAL_BANNER_PUBLIC_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: MANUAL_BANNER_SVG });
  });
  await page.route('**/.netlify/functions/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/outbound-sales-status') || pathname.endsWith('/outbound-sales-settings')) {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe('outbound-phase3-browser-contract');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(safeStatus) });
      return;
    }
    if (pathname.endsWith('/outbound-sales-prospects')) {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe('outbound-phase3-browser-contract');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shadowQueue) });
      return;
    }
    if (pathname.endsWith('/outbound-sales-activity')) {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe('outbound-phase3-browser-contract');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shadowActivity) });
      return;
    }
    if (pathname.endsWith('/outbound-sales-manual-artwork')) {
      expect(route.request().method()).toBe('POST');
      const payload = route.request().postDataJSON();
      expect(payload.prospectId).toBe('11111111-1111-4111-8111-111111111111');
      expect(payload.dataBase64).toBeTruthy();
      manualBannerUploaded = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          prospectId: payload.prospectId,
          contentHash: 'a'.repeat(64),
          previewUrl: MANUAL_BANNER_PUBLIC_URL,
          sendReady: true,
          width: 1200,
          height: 675,
        }),
      });
      return;
    }
    if (pathname.endsWith('/outbound-sales-manual-review')) {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manualReviewQueue(manualBannerUploaded, manualEmailSent)) });
        return;
      }
      const payload = route.request().postDataJSON();
      expect(payload).toEqual({ prospectId: '11111111-1111-4111-8111-111111111111' });
      expect(manualBannerUploaded).toBe(true);
      manualEmailSent = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, duplicate: false, prospectId: payload.prospectId, messageId: 'mocked-resend-message-id' }) });
      return;
    }
    if (pathname.endsWith('/get-orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
});

test('authenticated Sales Engine pages remain usable on desktop and mobile', async ({ page }, testInfo) => {
  for (const route of routes) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${route.path.replaceAll('/', '\\/')}$`));
    await expect(page.getByRole('heading', { name: 'Outbound Sales Command Center' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'AI Sales Engine navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: route.visibleText, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: route.label, exact: true })).toHaveAttribute('aria-current', 'page');

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    await page.screenshot({ path: testInfo.outputPath(`${route.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.png`), fullPage: true });
  }
});

test('Sales Engine and existing Orders navigation round-trip without losing admin state', async ({ page }) => {
  await page.goto('/admin/sales', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Return to Orders' }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.getByRole('tab', { name: 'AI Sales Engine' })).toBeVisible();
  await page.getByRole('tab', { name: 'AI Sales Engine' }).click();
  await expect(page).toHaveURL(/\/admin\/sales$/);
  await expect(page.getByRole('heading', { name: 'Outbound Sales Command Center' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);
});

test('Lead Review requires a per-company upload, previews that image, and sends only after the click', async ({ page }) => {
  await page.goto('/admin/sales/lead-review', { waitUntil: 'domcontentloaded' });
  const card = page.locator('article').filter({ hasText: 'Lugz' });
  const sendButton = card.getByRole('button', { name: 'Send', exact: true });

  await expect(card.getByText('Upload required before Send', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Preview email', exact: true })).toHaveCount(0);
  await expect(sendButton).toBeDisabled();
  await expect(card.getByText('Sent', { exact: true })).toHaveCount(0);

  await card.locator('input[type="file"]').setInputFiles({
    name: 'lugz-banner.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });

  await expect(card.getByText('Uploaded and ready for email preview', { exact: true })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Uploaded banner concept for Lugz' })).toBeVisible();
  await expect(card.getByText('Concept visualization only.', { exact: true })).toBeVisible();
  await expect(sendButton).toBeEnabled();

  await card.getByRole('button', { name: 'Preview email', exact: true }).click();
  const emailPreview = page.frameLocator('iframe[title="Email preview for Lugz"]');
  const deliveredBanner = emailPreview.getByRole('img', { name: 'Banner concept for Lugz' });
  await expect(deliveredBanner).toBeVisible();
  expect(await deliveredBanner.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(0);
  await expect(emailPreview.getByText('Concept visualization only.', { exact: true })).toBeVisible();
  await expect(card.getByText('Sent', { exact: true })).toHaveCount(0);

  await sendButton.click();
  await expect(card.getByText('Sent', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
});

test('safe controls and the completed-system hard locks are visibly authoritative', async ({ page }) => {
  await page.goto('/admin/sales/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Shadow Mode')).toBeChecked();
  await expect(page.getByLabel('Live Sending locked')).toBeDisabled();
  await expect(page.getByLabel('Live Sending locked')).not.toBeChecked();
  await expect(page.getByLabel('Shadow Generation')).toBeChecked();
  await expect(page.getByLabel('Emergency Pause')).not.toBeChecked();
  await expect(page.getByLabel('Daily send limit')).toHaveValue('30');
  await expect(page.getByLabel('Monthly OpenAI stop')).toHaveValue('8');
  await expect(page.getByText('Apollo is test/staging-only, disabled by default, and has no browser-editable credential path.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Outbound delivery provider compliance lock' })).toBeVisible();
  await expect(page.getByText("Resend's current Acceptable Use Policy prohibits cold outreach.", { exact: false })).toBeVisible();
});

test('Shadow Mode queue exposes grounded personalized copy, cost, and no-send state', async ({ page }) => {
  await page.goto('/admin/sales/prospects', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prospect Queue & Personalized Previews' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'River City Community Sports', exact: true })).toBeVisible();
  await expect(page.getByLabel('Lead score 68')).toBeVisible();
  await expect(page.getByText('Syntax valid · business domain matches · business mailbox')).toBeVisible();
  await expect(page.getByText('Banner planning for your summer tournament')).toBeVisible();
  await expect(page.getByText('Grounding passed')).toBeVisible();
  await expect(page.getByText('Never sent')).toBeVisible();
  await expect(page.getByText('Suggested follow-up Aug 10, 2026 · planning only')).toBeVisible();
  await expect(page.getByText('$0.02')).toBeVisible();
});

test('activity and cost views expose actual tokens and spend without a send action', async ({ page }) => {
  await page.goto('/admin/sales/activity', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Personalized Outreach Previews' })).toBeVisible();
  await expect(page.getByText('Banner planning for your summer tournament')).toBeVisible();
  await expect(page.getByText('$0.0006').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /send/i })).toHaveCount(0);
  await page.goto('/admin/sales/costs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('920', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('185', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Local $8 stop')).toBeVisible();
});
