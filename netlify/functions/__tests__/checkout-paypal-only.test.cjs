const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('checkout no longer routes PayPal through the accidental contact form wrapper', () => {
  const viteConfig = read('vite.config.ts');
  const removedWrapper = path.join(
    repoRoot,
    'src/components/checkout/PayPalCheckoutContact.tsx',
  );

  assert.equal(viteConfig.includes('PayPalCheckoutContact'), false);
  assert.equal(fs.existsSync(removedWrapper), false);
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
