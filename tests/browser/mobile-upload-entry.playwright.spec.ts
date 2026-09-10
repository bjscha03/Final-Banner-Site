import { expect, test, type Locator, type Page } from '@playwright/test';

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

const expectNoHorizontalOverflow = async (page: Page) => {
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth + 1
  ))).toBe(true);
};

const expectChooserFromAction = async (page: Page, action: Locator) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    action.click(),
  ]);
  expect(chooser.isMultiple()).toBe(false);
};

test.beforeEach(async ({ page }) => {
  await mockNoncriticalFunctions(page);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test('banner upload opens the native chooser from the first visible upload action', async ({ page }) => {
  await page.goto('/google-ads-banner?product=banner', { waitUntil: 'domcontentloaded' });
  await expectNoHorizontalOverflow(page);

  const action = page.getByRole('button', { name: /Upload your artwork.*PNG, JPG, or PDF/i }).first();

  await expect(action).toBeVisible();
  await expectChooserFromAction(page, action);
  if ((page.viewportSize()?.width ?? 1024) < 768) {
    await expect(page.getByTestId('mobile-subtotal-bar')).toBeVisible();
    await expect(page.locator('[data-mobile-guided-action]')).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
});

test('yard-sign add-design action opens the native chooser without a second tap', async ({ page }) => {
  await page.goto('/google-ads-banner?product=yard-signs', { waitUntil: 'domcontentloaded' });
  await expectNoHorizontalOverflow(page);

  const action = page.getByRole('button', { name: /Upload your artwork.*PNG, JPG, or PDF/i }).first();

  await expect(action).toBeVisible();
  await expectChooserFromAction(page, action);
  if ((page.viewportSize()?.width ?? 1024) < 768) {
    await expect(page.getByTestId('mobile-subtotal-bar')).toBeVisible();
    await expect(page.locator('[data-mobile-guided-action]')).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
});
