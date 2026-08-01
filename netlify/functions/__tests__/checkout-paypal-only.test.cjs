const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('checkout uses the contact-safe PayPal wrapper and keeps the accidental shipping wrapper removed', () => {
  const viteConfig = read('vite.config.ts');
  const safeWrapper = read('src/components/checkout/PayPalCheckoutContactSafe.tsx');
  const removedWrapper = path.join(
    repoRoot,
    'src/components/checkout/PayPalCheckoutContact.tsx',
  );

  assert.equal(fs.existsSync(removedWrapper), false);
  assert.match(viteConfig, /PayPalCheckoutContactSafe\.tsx/);
  assert.match(safeWrapper, /Email for order confirmation and tracking/);
  assert.match(safeWrapper, /payload\.email = customerEmail/);
  assert.match(safeWrapper, /disabled=\{Boolean\(props\.disabled\)\}/);
  assert.equal(safeWrapper.includes('props.disabled || !contactValid'), false);
  assert.match(safeWrapper, /CHECKOUT_CONTACT_REQUIRED/);
  assert.match(safeWrapper, /if \(!contactValid\)/);
  assert.match(safeWrapper, /Enter email for order updates before paying/);
  assert.equal(safeWrapper.includes('Full name'), false);
  assert.equal(safeWrapper.includes('Order contact'), false);
  assert.equal(safeWrapper.includes('shipping address'), false);
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
