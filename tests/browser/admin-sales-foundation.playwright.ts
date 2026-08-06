import { expect, test } from '@playwright/test';

const VISUAL_QA_PROJECTS = new Set(['chromium-1440x900', 'chromium-pixel8-portrait']);

const routes = [
  { path: '/admin/sales', label: 'Dashboard', visibleText: 'Operational safeguards' },
  { path: '/admin/sales/prospects', label: 'Prospect Queue', visibleText: 'Deterministic Prospect Queue' },
  { path: '/admin/sales/activity', label: 'Email Activity', visibleText: 'Email Activity' },
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
  phase: 'discovery_qualification',
  schemaReady: true,
  databaseConfigured: true,
  databaseAvailable: true,
  controls: {
    mode: 'disabled',
    outboundSalesEnabled: false,
    shadowModeEnabled: true,
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
    liveSendingEnabled: false,
    emergencyPaused: false,
    dailySendLimit: 30,
    monthlyOpenAIBudgetCents: 800,
    openAIProjectLimitRecommendationCents: 1000,
    monthlyProviderBudgetCents: 0,
    businessTimezone: 'America/New_York',
    settingsVersion: 1,
  },
  secretStatus: { openAI: false, resend: false, resendWebhook: false, emailVerification: false, apolloDiscovery: false },
  providers: [
    { id: 'google_places', displayName: 'Google Places', kind: 'discovery', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, executionScope: 'not_installed', executionAllowed: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
    { id: 'apollo', displayName: 'Apollo', kind: 'discovery', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: true, executionScope: 'test_staging_only', executionAllowed: true, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
    { id: 'email_verification', displayName: 'Email verification provider', kind: 'email_verification', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, executionScope: 'not_installed', executionAllowed: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
  ],
  metrics: {
    prospectsTotal: 0,
    readyForOutreach: 0,
    messagesTotal: 0,
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
    openAICallsInstalled: false,
    emailSendingInstalled: false,
    scheduledAutomationInstalled: false,
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
  statusCounts: { qualified: 1 },
  providerUsage: [{ providerId: 'apollo', operation: 'organization_search', requests: 1, results: 1, credits: 1, costMicrousd: 19600 }],
  prospects: [{
    id: '00000000-0000-0000-0000-000000000201',
    businessName: 'River City Community Sports',
    websiteUrl: 'https://rivercitysports.example/',
    canonicalDomain: 'rivercitysports.example',
    industry: 'Sports & Recreation',
    businessType: 'Community sports organization',
    locationCount: 2,
    status: 'qualified',
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
    primaryContact: {
      email: 'events@rivercitysports.example', sourceUrl: 'https://rivercitysports.example/contact',
      syntaxValid: true,
      verificationStatus: 'risky', verificationReason: 'Role or group addresses are retained as evidence but are not outreach-eligible.',
      mxStatus: 'present', isRoleAddress: true, isFreeMailbox: false, domainMatches: true,
      contactQualityScore: 85, sendEligible: false,
    },
    discoveredAt: '2026-08-05T12:00:00.000Z',
    lastResearchedAt: '2026-08-05T12:05:00.000Z',
    lastQualifiedAt: '2026-08-05T12:06:00.000Z',
  }],
};

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!VISUAL_QA_PROJECTS.has(testInfo.project.name), 'Desktop and phone coverage are sufficient for the Phase 2 admin shell.');
  await page.addInitScript(() => {
    const admin = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'outbound-phase2-qa@example.test',
      is_admin: true,
    };
    window.localStorage.setItem('banners_current_user', JSON.stringify(admin));
    window.localStorage.setItem('banners_server_session', 'outbound-phase2-browser-contract');
    window.sessionStorage.setItem('banners_server_session', 'outbound-phase2-browser-contract');
  });
  await page.route('**/.netlify/functions/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/outbound-sales-status') || pathname.endsWith('/outbound-sales-settings')) {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe('outbound-phase2-browser-contract');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(safeStatus) });
      return;
    }
    if (pathname.endsWith('/outbound-sales-prospects')) {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe('outbound-phase2-browser-contract');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shadowQueue) });
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

test('safe defaults and the Phase 2 hard lock are visibly authoritative', async ({ page }) => {
  await page.goto('/admin/sales/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Shadow Mode')).toBeChecked();
  await expect(page.getByLabel('Live Sending locked')).toBeDisabled();
  await expect(page.getByLabel('Live Sending locked')).not.toBeChecked();
  await expect(page.getByLabel('Emergency Pause')).not.toBeChecked();
  await expect(page.getByLabel('Daily send limit')).toHaveValue('30');
  await expect(page.getByLabel('Monthly OpenAI stop')).toHaveValue('8');
  await expect(page.getByText('Apollo is test/staging-only, disabled by default, and has no browser-editable credential path.')).toBeVisible();
});

test('Shadow Mode queue exposes deterministic evidence and no-send state', async ({ page }) => {
  await page.goto('/admin/sales/prospects', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Deterministic Prospect Queue' })).toBeVisible();
  await expect(page.getByText('River City Community Sports')).toBeVisible();
  await expect(page.getByLabel('Lead score 68')).toBeVisible();
  await expect(page.getByText('Syntax valid · business domain matches · business mailbox')).toBeVisible();
  await expect(page.getByText('No subject or email is generated in Phase 2.')).toBeVisible();
  await expect(page.getByText('$0.02')).toBeVisible();
});
