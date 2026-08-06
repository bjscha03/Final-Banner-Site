import { expect, test } from '@playwright/test';

const ANALYTICS_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'connect.facebook.net',
  'facebook.com/tr',
  'clarity.ms',
  'contentsquare.net',
  'licdn.com',
  'posthog.com',
];

test('preview, development, and automated routes never load customer analytics', async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on('request', (request) => {
    if (ANALYTICS_HOSTS.some((host) => request.url().includes(host))) {
      analyticsRequests.push(request.url());
    }
  });

  for (const route of ['/', '/design', '/checkout', '/admin/orders']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
  }

  const loadedAnalyticsScripts = await page.locator('script[src]').evaluateAll((scripts, analyticsHosts) => scripts
    .map((script) => (script as HTMLScriptElement).src)
    .filter((src) => analyticsHosts.some((host) => src.includes(host))), ANALYTICS_HOSTS);

  expect(analyticsRequests).toEqual([]);
  expect(loadedAnalyticsScripts).toEqual([]);
  expect(await page.evaluate(() => ({
    hasDataLayer: Array.isArray(window.dataLayer),
    hasGtag: typeof window.gtag === 'function',
    hasMeta: typeof window.fbq === 'function',
  }))).toEqual({ hasDataLayer: false, hasGtag: false, hasMeta: false });
});
