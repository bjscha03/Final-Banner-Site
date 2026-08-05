import { expect, test } from '@playwright/test';

const VISUAL_QA_PROJECTS = new Set(['chromium-1440x900', 'chromium-pixel8-portrait']);

const routes = [
  { path: '/admin/sales', label: 'Dashboard', visibleText: 'Operational safeguards' },
  { path: '/admin/sales/prospects', label: 'Prospect Queue', visibleText: 'Prospect Queue' },
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
  phase: 'foundation',
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
  secretStatus: { openAI: false, resend: false, resendWebhook: false, emailVerification: false },
  providers: [
    { id: 'google_places', displayName: 'Google Places', kind: 'discovery', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
    { id: 'apollo', displayName: 'Apollo', kind: 'discovery', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
    { id: 'email_verification', displayName: 'Email verification provider', kind: 'email_verification', acquisitionMode: 'licensed_api', configured: false, adapterInstalled: false, enabled: false, dailyRequestLimit: 0, monthlyBudgetCents: 0 },
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
    providerExecutionInstalled: false,
    openAICallsInstalled: false,
    emailSendingInstalled: false,
    scheduledAutomationInstalled: false,
    liveSendingPhaseLocked: true,
  },
};

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!VISUAL_QA_PROJECTS.has(testInfo.project.name), 'Desktop and phone coverage are sufficient for the Phase 1 admin shell.');
  await page.addInitScript(() => {
    const admin = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'outbound-phase1-qa@example.test',
      is_admin: true,
    };
    window.localStorage.setItem('banners_current_user', JSON.stringify(admin));
    window.localStorage.setItem('banners_server_session', 'outbound-phase1-browser-contract');
    window.sessionStorage.setItem('banners_server_session', 'outbound-phase1-browser-contract');
  });
  await page.route('**/.netlify/functions/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/outbound-sales-status') || pathname.endsWith('/outbound-sales-settings')) {
      const headers = await route.request().allHeaders();
      expect(headers['x-banners-admin-session']).toBe('outbound-phase1-browser-contract');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(safeStatus) });
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

test('safe defaults and the Phase 1 hard lock are visibly authoritative', async ({ page }) => {
  await page.goto('/admin/sales/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Shadow Mode')).toBeChecked();
  await expect(page.getByLabel('Live Sending locked')).toBeDisabled();
  await expect(page.getByLabel('Live Sending locked')).not.toBeChecked();
  await expect(page.getByLabel('Emergency Pause')).not.toBeChecked();
  await expect(page.getByLabel('Daily send limit')).toHaveValue('30');
  await expect(page.getByLabel('Monthly OpenAI stop')).toHaveValue('8');
  await expect(page.getByText('No adapter is active in Phase 1.')).toBeVisible();
});
