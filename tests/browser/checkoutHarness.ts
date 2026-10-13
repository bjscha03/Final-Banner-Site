import { type Page } from '@playwright/test';
import sharp from 'sharp';

export const CHECKOUT_ITEM = {
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
  final_render_url: 'https://assets.example.test/checkout-artwork.png',
  created_at: '2026-08-07T12:00:00.000Z',
};

const PAYMENT_ENDPOINTS = new Set([
  '/.netlify/functions/create-order',
  '/.netlify/functions/paypal-create-order',
  '/.netlify/functions/paypal-capture-minimal',
  '/.netlify/functions/paypal-payment-status',
]);

export const installCheckoutHarness = async (page: Page, items = [CHECKOUT_ITEM]) => {
  const paymentEndpointRequests: string[] = [];

  await page.addInitScript((cartItems) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('cart-storage', JSON.stringify({
      state: { items: cartItems, _cartOwnerId: null },
      version: 0,
    }));
  }, items);

  const artwork = await sharp({ create: { width: 480, height: 240, channels: 3, background: '#18448D' } }).png().toBuffer();
  await page.route('https://assets.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: artwork }));

  await page.route('**/.netlify/functions/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (PAYMENT_ENDPOINTS.has(path)) paymentEndpointRequests.push(path);

    const body = path.endsWith('/cart-load')
      ? { cartData: items }
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

