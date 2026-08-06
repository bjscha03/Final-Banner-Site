import { expect, test } from '@playwright/test';

const VISUAL_QA_PROJECTS = new Set(['chromium-1440x900', 'chromium-pixel8-portrait']);

const routes = [
  { path: '/admin/sales', label: 'Dashboard', visibleText: 'Operational safeguards' },
  { path: '/admin/sales/prospects', label: 'Prospect Queue', visibleText: 'Prospect Queue & Personalized Previews' },
  { path: '/admin/sales/activity', label: 'Email Activity', visibleText: 'Personalized Outreach Previews' },
  { path: '/admin/sales/replies', label: 'Replies', visibleText: 'Replies' },
  { path: '/admin/sales/orders', label: 'Orders & Revenue', visibleText: 'Orders & Revenue Generated' },
  { path: '/admin/sales/performance', label: 'Performance', visibleText: 'Industry & Campaign Performance' },
  { path: '/admin/sales/costs', label: 'Cost Analytics', visibleText: 'Cost Analytics' },
  { path: '/admin/sales/errors', label: 'Error Logs', visibleText: 'Error Logs' },
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
