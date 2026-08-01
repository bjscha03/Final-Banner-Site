const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('checkout routes directly to PayPal and has no duplicate site contact form', () => {
  const viteConfig = read('vite.config.ts');
  const checkout = read('src/pages/Checkout.tsx');
  const paypalCheckout = read('src/components/checkout/PayPalCheckout.tsx');
  const contactWrapper = path.join(
    repoRoot,
    'src/components/checkout/PayPalCheckoutContactSafe.tsx',
  );
  const removedShippingWrapper = path.join(
    repoRoot,
    'src/components/checkout/PayPalCheckoutContact.tsx',
  );

  assert.equal(fs.existsSync(contactWrapper), false);
  assert.equal(fs.existsSync(removedShippingWrapper), false);
  assert.equal(viteConfig.includes('PayPalCheckoutContactSafe'), false);
  assert.equal(viteConfig.includes('PayPalCheckoutContact'), false);
  assert.match(checkout, /@\/components\/checkout\/PayPalCheckout/);
  assert.match(paypalCheckout, /fundingSource=\{"card" as any\}/);
  assert.match(paypalCheckout, /fundingSource=\{"paypal" as any\}/);
  assert.equal(paypalCheckout.includes('Email for order confirmation and tracking'), false);
  assert.equal(paypalCheckout.includes('Email for confirmation'), false);
});

test('PayPal order creation requests the standard guest checkout experience', () => {
  const createOrder = read('netlify/functions/_shared/legacy/paypal-create-order.cjs');

  assert.match(createOrder, /landing_page:\s*'GUEST_CHECKOUT'/);
  assert.match(createOrder, /shipping_preference:\s*'GET_FROM_FILE'/);
  assert.match(createOrder, /user_action:\s*'PAY_NOW'/);
});

test('capture replaces a generated guest email with PayPal payer data before notifications', () => {
  const capture = read('netlify/functions/_shared/legacy/paypal-capture-minimal.cjs');
  const captureWrapper = read('netlify/functions/paypal-capture-minimal.mjs');

  assert.match(capture, /extractCustomerEmail\(paypalData\)/);
  assert.match(capture, /email ILIKE 'guest-%@bannersonthefly\.com'/);
  assert.match(capture, /THEN \$\{payerEmail \|\| null\}/);
  assert.match(captureWrapper, /triggerOrderNotifications\(event, internalOrderId\)/);
});

test('legacy card component cannot load or call a non-PayPal payment SDK', () => {
  const compatibilityShim = read('src/components/checkout/StripeCheckout.tsx');

  assert.equal(compatibilityShim.includes('@stripe/'), false);
  assert.equal(compatibilityShim.includes('fetch('), false);
  assert.equal(compatibilityShim.includes('loadStripe'), false);
  assert.match(compatibilityShim, /PayPal-only/);
});

test('Admin paid-order filtering contains only PayPal reconciliation logic', () => {
  const getOrders = read('netlify/functions/get-orders.mjs');

  assert.equal(/stripe/i.test(getOrders), false);
  assert.match(getOrders, /paypal_capture_id/);
  assert.match(getOrders, /isAdminVisiblePaidOrder/);
});
