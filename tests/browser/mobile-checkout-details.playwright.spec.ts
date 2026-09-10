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

const PAYMENT_ENDPOINTS = new Set([
  '/.netlify/functions/create-order',
  '/.netlify/functions/paypal-create-order',
  '/.netlify/functions/paypal-capture-minimal',
  '/.netlify/functions/paypal-payment-status',
]);

const installCheckoutHarness = async (page: Page) => {
  const paymentEndpointRequests: string[] = [];

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
    if (PAYMENT_ENDPOINTS.has(path)) paymentEndpointRequests.push(path);

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
      body: `(() => {
        const makeCardField = (name) => () => {
          let mountedField = null;
          return {
            render(container) {
              mountedField = document.createElement('div');
              mountedField.dataset.paypalCardField = name;
              mountedField.setAttribute('aria-hidden', 'true');
              mountedField.style.cssText = 'display:block;width:100%;height:44px;';
              container.replaceChildren(mountedField);
              return Promise.resolve();
            },
            close() {
              mountedField?.remove();
              mountedField = null;
              return Promise.resolve();
            },
          };
        };

        window.paypal = {
          Buttons() {
            let mountedButton = null;
            return {
              isEligible: () => true,
              render(container) {
                mountedButton = document.createElement('div');
                mountedButton.dataset.paypalButton = 'mock';
                mountedButton.setAttribute('aria-hidden', 'true');
                mountedButton.style.cssText = 'display:block;width:100%;height:42px;';
                container.replaceChildren(mountedButton);
                return Promise.resolve();
              },
              close() {
                mountedButton?.remove();
                mountedButton = null;
                return Promise.resolve();
              },
              updateProps() {},
            };
          },
          CardFields() {
            return {
              isEligible: () => true,
              submit: () => Promise.resolve(),
              NameField: makeCardField('name'),
              NumberField: makeCardField('number'),
              ExpiryField: makeCardField('expiry'),
              CVVField: makeCardField('cvv'),
            };
          },
        };
      })();`,
    });
  });

  return { paymentEndpointRequests };
};

test('contact and delivery details are visible before either payment method', async ({ page }) => {
  await installCheckoutHarness(page);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

  const checkoutHeader = page.locator('[data-checkout-header]');
  const contactHeading = page.getByRole('heading', { name: 'Contact & delivery' });
  const firstName = page.getByLabel(/First Name/);
  const cardButton = page.getByRole('button', { name: 'Pay with Debit or Credit Card' });

  await expect(checkoutHeader).toBeVisible();
  await expect(checkoutHeader).toContainText('Secure checkout');
  await expect(page.locator('nav[aria-label="Primary navigation"]')).toHaveCount(0);
  await expect(page.getByLabel('Email address for newsletter')).toHaveCount(0);
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

  if ((page.viewportSize()?.width ?? 1024) < 1024) {
    const paymentBox = await page.getByRole('heading', { name: 'Payment', exact: true }).boundingBox();
    const orderSummaryBox = await page.getByRole('heading', { name: 'Order Summary', exact: true }).boundingBox();
    expect(paymentBox).not.toBeNull();
    expect(orderSummaryBox).not.toBeNull();
    expect(paymentBox!.y).toBeLessThan(orderSummaryBox!.y);
    await expect(page.getByRole('button', { name: 'Review order' })).toBeVisible();
  }

  const shippingSame = page.getByLabel('Shipping address is the same as billing');
  await expect(shippingSame).toBeChecked();
  await shippingSame.uncheck();
  await expect(page.getByLabel(/Shipping Name/)).toBeVisible();

  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth + 1
  ))).toBe(true);
});

test('debit or credit card disclosure opens before required contact details are complete', async ({ page }) => {
  const { paymentEndpointRequests } = await installCheckoutHarness(page);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

  const firstName = page.getByLabel(/First Name/);
  const cardButton = page.getByRole('button', { name: 'Pay with Debit or Credit Card' });

  await expect(firstName).toBeVisible({ timeout: 20_000 });
  await expect(firstName).toHaveValue('');
  await expect(cardButton).toBeEnabled();
  await expect(cardButton).toHaveAttribute('aria-expanded', 'false');

  await cardButton.click();

  const cardFields = page.locator('#paypal-inline-card-fields');
  await expect(cardButton).toHaveAttribute('aria-expanded', 'true');
  await expect(cardFields).toHaveCount(1);
  await expect(cardFields).toBeVisible();
  await expect(cardFields.locator('[data-paypal-card-field]')).toHaveCount(4);
  expect(paymentEndpointRequests).toEqual([]);
});
