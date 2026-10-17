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

test('storefront mobile navigation opens, returns home, and stays off the Google Ads route', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1024) >= 1024, 'Mobile navigation');
  for (const route of ['/design', '/design?product=banner', '/design?product=vinyl-banners', '/design?product=yard-signs', '/design?product=car-magnets']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const header = page.locator('[data-site-header]');
    await expect(header.getByRole('link', { name: 'Banners On The Fly', exact: true })).toHaveAttribute('href', '/');
    await header.getByRole('button', { name: 'Open navigation menu' }).click();
    const menu = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Yard Signs', exact: true })).toBeVisible();
    await menu.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(menu).toHaveCount(0);
  }
  await page.goto('/google-ads-banner?product=banner', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-site-header]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
});

for (const route of ROUTES) {
  test(`${route} keeps the timer and mobile footer consistent`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const isMobile = (page.viewportSize()?.width ?? 1024) < 1024;
    const mobileTimer = page.locator('[data-mobile-delivery-timer]');
    const mobileFooter = page.getByTestId('mobile-subtotal-bar');

    if (isMobile) {
      await expect(mobileFooter).toBeVisible();
      await expect(mobileFooter).toContainText("6' × 3'");
      await expect(mobileFooter.getByRole('button', { name: 'Upload artwork', exact: true })).toBeVisible();
      await expect(page.locator('[data-mobile-guided-action]')).toHaveCount(0);
      await expect(page.locator('#size-section')).toBeVisible();
      await expect(page.locator('#upload-section')).toBeVisible();
      await expect(page.locator('#material-section')).toBeVisible();
      await expect(page.getByLabel('Quantity', { exact: true })).toBeVisible();
      await expect(mobileFooter.getByTestId('free-next-day-air-badge')).toContainText('Free Next Day Air Shipping');
      await expect(page.getByRole('radio', { name: /Double-sided/ })).toBeVisible();
      await expect(page.getByTestId('fading-google-reviews')).toBeVisible();
      await expect(mobileFooter.getByRole('button', { name: /^Upload artwork$/i })).toBeVisible();
    } else {
      const reviews = page.getByTestId('google-reviews').filter({ visible: true });
      await expect(reviews).toBeVisible();
      expect((await reviews.boundingBox())!.height).toBeLessThanOrEqual(44);
      await expect(reviews.locator('.google-review-marquee-track')).toHaveCSS('animation-name', 'google-review-marquee');
      await reviews.getByRole('button', { name: 'Pause Google reviews', exact: true }).click();
      await expect(reviews.locator('.google-review-marquee-track')).toHaveCSS('animation-play-state', 'paused');
      await expect(reviews.getByRole('button', { name: 'Play Google reviews', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(mobileTimer).toBeHidden();
      await expect(mobileFooter).toBeHidden();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
