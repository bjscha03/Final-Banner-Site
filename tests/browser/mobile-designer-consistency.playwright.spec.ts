import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/design?product=vinyl-banners',
  '/google-ads-banner?product=banner',
] as const;

const mockNoncriticalFunctions = async (page: Page) => {
  await page.route('**/.netlify/functions/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/cart-load')
      ? { cartData: [] }
      : path.endsWith('/paypal-config')
        ? { enabled: false }
        : { success: true };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

test.beforeEach(async ({ page }) => {
  await mockNoncriticalFunctions(page);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

for (const route of ROUTES) {
  test(`${route} keeps the timer and mobile footer consistent`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const isAds = route.startsWith('/google-ads-banner');
    const isMobile = (page.viewportSize()?.width ?? 1024) < 1024;
    const mobileTimer = page.locator('[data-mobile-delivery-timer]');
    const mobileFooter = page.getByTestId('mobile-subtotal-bar');

    if (isMobile) {
      await expect(mobileFooter).toBeVisible();
      await expect(mobileFooter.getByText('This banner · Before tax', { exact: true })).toBeVisible();
      await expect(mobileFooter.getByRole('button', { name: /View Cart \(0\)/i })).toBeVisible();
      await expect(page.locator('[data-mobile-guided-action]')).toHaveCount(0);
      await expect(mobileFooter.getByRole('button', { name: /^Upload artwork$/i })).toBeVisible();
    } else {
      await expect(mobileTimer).toBeHidden();
      await expect(mobileFooter).toBeHidden();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
