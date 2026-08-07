import { expect, test, type Page } from '@playwright/test';

const CHECKOUT_ITEM = {
  id: 'mobile-checkout-banner',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 8,
  unit_price_cents: 3600,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 3600,
  created_at: '2026-08-07T12:00:00.000Z',
};

const installCheckoutHarness = async (page: Page) => {
  await page.addInitScript((item) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('cart-storage', JSON.stringify({
      state: { items: [item], _cartOwnerId: null },
      version: 0,
    }));
  }, CHECKOUT_ITEM);

  await page.route('**/.netlify/functions/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/cart-load')
      ? { cartData: [CHECKOUT_ITEM] }
      : path.endsWith('/paypal-config')
        ? {
            enabled: true,
            clientId: 'browser-test-client',
            clientToken: 'browser-test-token',
            components: 'buttons,card-fields',
            environment: 'sandbox',
          }
        : { success: true };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // The test validates the merchant-owned form and never submits payment.
  // Keep the provider script deterministic and entirely local.
  await page.route('**paypal.com/sdk/js**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.paypal = window.paypal || {};',
    });
  });
};

test('contact and delivery details are visible before either payment method', async ({ page }) => {
  await installCheckoutHarness(page);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

  const contactHeading = page.getByRole('heading', { name: 'Contact & delivery' });
  const firstName = page.getByLabel(/First Name/);
  const cardButton = page.getByRole('button', { name: 'Pay with Debit or Credit Card' });

  await expect(contactHeading).toBeVisible({ timeout: 20_000 });
  await expect(firstName).toBeVisible();
  await expect(firstName).toHaveAttribute('autocomplete', 'given-name');
  await expect(cardButton).toHaveAttribute('aria-expanded', 'false');
  expect(await firstName.evaluate((input) => input.closest('#paypal-inline-card-fields'))).toBeNull();

  const firstNameBox = await firstName.boundingBox();
  expect(firstNameBox).not.toBeNull();
  expect(firstNameBox!.height).toBeGreaterThanOrEqual(44);

  if ((page.viewportSize()?.width ?? 1024) < 640) {
    const fontSize = await firstName.evaluate((input) => getComputedStyle(input).fontSize);
    expect(Number.parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
  }

  const shippingSame = page.getByLabel('Shipping address is the same as billing');
  await expect(shippingSame).toBeChecked();
  await shippingSame.uncheck();
  await expect(page.getByLabel(/Shipping Name/)).toBeVisible();

  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth + 1
  ))).toBe(true);
});
