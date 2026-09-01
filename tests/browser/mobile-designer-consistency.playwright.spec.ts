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
  test(`${route} offers the same responsive 8 by 4 banner upgrade`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const upsell = page.getByTestId('banner-size-upsell');
    await expect(upsell).toBeVisible();
    await expect(upsell).toHaveAttribute('data-upsell-state', 'offer');
    await expect(upsell).toContainText('BETTER LONG-DISTANCE VISIBILITY');
    await expect(upsell).toContainText('78% more print area');
    await expect(upsell.getByTestId('banner-size-upsell-price')).toHaveText('+$63');

    await upsell.getByTestId('banner-size-upsell-button').click();

    await expect(upsell).toHaveAttribute('data-upsell-state', 'selected');
    await expect(upsell).toContainText('banner is set for stronger visibility');
    await expect(upsell.getByTestId('banner-size-upsell-button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test(`${route} keeps the timer and mobile footer consistent`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
    const mobileTimer = page.locator('[data-mobile-delivery-timer]');
    const mobileFooter = page.getByTestId('mobile-subtotal-bar');

    if (isMobile) {
      await expect(mobileTimer).toBeVisible();
      await expect(mobileTimer.getByTestId('delivery-timer')).toBeVisible();
      await expect(mobileTimer).toContainText(/Expected (ship|shipment|delivery)|expected to ship/i);
      await expect(mobileTimer).toContainText(/\d{2,3}:\d{2}:\d{2}/);

      await expect(mobileFooter).toBeVisible();
      await expect(mobileFooter.getByText('Subtotal', { exact: true })).toBeVisible();
      await expect(mobileFooter.getByRole('button', { name: /View Cart \(0\)/i })).toBeVisible();
      await expect(page.locator('[data-mobile-guided-action]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Upload Artwork$/i })).toHaveCount(0);
    } else {
      await expect(mobileTimer).toBeHidden();
      await expect(mobileFooter).toBeHidden();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
