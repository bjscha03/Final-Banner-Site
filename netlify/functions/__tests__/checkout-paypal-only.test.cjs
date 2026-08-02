const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('checkout routes directly to hosted PayPal with no duplicate site contact form', () => {
  const viteConfig = read('vite.config.ts');
  const checkout = read('src/pages/Checkout.tsx');
  const paypalCheckout = read('src/components/checkout/PayPalCheckoutReliable.tsx');
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
  assert.match(viteConfig, /PayPalCheckoutReliable\.tsx/);
  assert.match(checkout, /@\/components\/checkout\/PayPalCheckout/);
  assert.match(paypalCheckout, /renderButton\('card'\)/);
  assert.match(paypalCheckout, /renderButton\('paypal'\)/);
  assert.match(paypalCheckout, /fundingSource=\{fundingSource as any\}/);
  assert.equal(paypalCheckout.includes('Email for order confirmation and tracking'), false);
  assert.equal(paypalCheckout.includes('Email for confirmation'), false);
  assert.equal(paypalCheckout.includes('<input'), false);
  assert.equal(paypalCheckout.includes('PayPalCardFieldsProvider'), false);
  assert.equal(paypalCheckout.includes('PayPalCardFieldsForm'), false);
  assert.equal(/fastlane/i.test(paypalCheckout), false);
});

test('PayPal SDK config uses hosted buttons only and no Fastlane token generation', () => {
  const config = read('netlify/functions/_shared/legacy/paypal-config.cjs');
  assert.match(config, /components:\s*'buttons'/);
  assert.match(config, /fastlane:\s*false/);
  assert.equal(config.includes('buttons,card-fields'), false);
  assert.equal(config.includes('/v1/identity/generate-token'), false);
  assert.equal(config.includes('clientToken'), false);
});

test('PayPal runtime normalizes live aliases before provider calls', () => {
  const runtime = read('netlify/functions/_shared/paypal-runtime-config.cjs');
  const createOrder = read('netlify/functions/paypal-create-order.mjs');
  const capture = read('netlify/functions/paypal-capture-minimal.mjs');
  const webhook = read('netlify/functions/paypal-webhook.mjs');

  assert.match(runtime, /\['live', 'production', 'prod'\]/);
  assert.match(runtime, /PAYPAL_CLIENT_ID_\$\{suffix\}/);
  assert.match(runtime, /PAYPAL_SECRET_\$\{suffix\}/);
  assert.match(createOrder, /preparePayPalRuntime\(\)/);
  assert.match(capture, /preparePayPalRuntime\(\)/);
  assert.match(webhook, /preparePayPalRuntime\(\)/);
});

test('PayPal order creation uses the proven hosted-checkout request', () => {
  const createOrder = read('netlify/functions/_shared/legacy/paypal-create-order-forward.cjs');
  const entrypoint = read('netlify/functions/paypal-create-order.mjs');

  assert.equal(createOrder.includes("landing_page: 'GUEST_CHECKOUT'"), false);
  assert.match(createOrder, /shipping_preference:\s*'GET_FROM_FILE'/);
  assert.match(createOrder, /user_action:\s*'PAY_NOW'/);
  assert.match(createOrder, /PayPal rejected order creation/);
  assert.match(entrypoint, /paypal-create-order-forward\.cjs/);
  assert.equal(entrypoint.includes('paypal-create-order-final.cjs'), false);
});

test('capture persists PayPal-hosted customer details before queuing follow-ups', () => {
  const capture = read('netlify/functions/_shared/legacy/paypal-capture-final.cjs');
  const customerInfo = read('netlify/functions/_shared/legacy/paypal-customer-info.cjs');
  const captureWrapper = read('netlify/functions/paypal-capture-minimal.mjs');

  assert.match(capture, /extractCustomerEmail\(paypalData\)/);
  assert.match(capture, /extractShippingAddress\(paypalData\)/);
  assert.match(customerInfo, /refreshOrderCustomerInfo/);
  assert.match(customerInfo, /payer\?\.email_address/);
  assert.match(customerInfo, /shipping\?\.address/);
  assert.match(captureWrapper, /refreshOrderCustomerInfo/);
  assert.match(captureWrapper, /queuePaidOrderFollowups\(event, internalOrderId\)/);
  assert.match(captureWrapper, /followupsQueued/);
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
