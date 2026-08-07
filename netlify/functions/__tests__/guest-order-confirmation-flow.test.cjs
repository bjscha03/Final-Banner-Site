'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('get-order never falls back to public ID-only order access', () => {
  const entrypoint = read('netlify/functions/get-order.mjs');
  const handler = read('netlify/functions/_shared/legacy/get-order.cjs');

  assert.doesNotMatch(entrypoint, /get-order-public|publicModule|statusCode\) === 401/);
  assert.match(handler, /readOrderConfirmationToken\(event\)/);
  assert.match(handler, /verifyOrderConfirmationToken/);
  assert.match(handler, /confirmationMatchesPaidOrder\(confirmation, order\)/);
  assert.match(handler, /X-Order-Confirmation-Token/);
});

test('successful PayPal capture returns the order-bound confirmation token', () => {
  const capture = read('netlify/functions/_shared/legacy/paypal-capture-final.cjs');

  assert.match(capture, /createPaidOrderConfirmationToken\(order\)/);
  assert.match(capture, /orderConfirmationToken,/);
  assert.match(capture, /orderAccessRecovery = 'confirmation_email_or_account'/);
  assert.ok(capture.indexOf("status = 'paid'") < capture.lastIndexOf('successPayload(persisted'));
});

test('payment-status recovery requires the checkout key and forwards capture-issued confirmation', () => {
  const client = read('src/components/checkout/PayPalCheckoutReliable.tsx');
  const status = read('netlify/functions/paypal-payment-status.mjs');

  assert.match(client, /checkoutKey: checkoutKeyRef\.current/);
  assert.match(status, /constantTimeEqual\(checkoutKey, order\.checkout_idempotency_key\)/);
  assert.match(status, /captureModule\.handler/);
  assert.match(status, /paidPayload\([\s\S]*order,[\s\S]*capturePayload/);
  assert.doesNotMatch(status, /createPaidOrderConfirmationToken/);
});

test('guest confirmation token stays out of the URL and is sent only as a get-order header', () => {
  const checkout = read('src/pages/Checkout.tsx');
  const confirmation = read('src/pages/PaymentSuccess.tsx');

  assert.match(checkout, /orderConfirmationToken: orderData\?\.orderConfirmationToken/);
  assert.doesNotMatch(checkout, /payment-success\?[^`]*orderConfirmationToken/);
  assert.match(confirmation, /'X-Order-Confirmation-Token': orderConfirmationToken/);
  assert.doesNotMatch(confirmation, /get-order\?[^`]*orderConfirmationToken/);
  assert.match(confirmation, /attemptCanonicalPurchaseTracking\(orderId, loadedOrder/);
});

test('customer confirmation and resend emails use signed fragment order links', () => {
  const notify = read('netlify/functions/_shared/legacy/notify-order.cjs');
  const resend = read('netlify/functions/_shared/legacy/admin-resend-confirmation.cjs');
  const reactTemplate = read('src/emails/OrderConfirmation.tsx');
  const orderPage = read('src/pages/OrderDetail.tsx');
  const main = read('src/main.tsx');

  assert.match(notify, /createGuestOrderViewUrl\(origin, order\)/);
  assert.match(resend, /createGuestOrderViewUrl\(origin, order\)/);
  assert.doesNotMatch(notify, /invoiceUrl\s*=\s*`\$\{origin\}\/orders/);
  assert.doesNotMatch(resend, /invoiceUrl\s*=\s*`\$\{origin\}\/orders/);
  assert.doesNotMatch(reactTemplate, /PUBLIC_SITE_URL[\s\S]*\/orders\/\$\{order\.id\}/);
  assert.match(orderPage, /'X-Order-View-Token': orderViewToken/);
  assert.match(main, /consumeOrderViewCredentialFromCurrentRoute\(\)/);
});

test('canonical purchase tracking preserves one-time and test-order guards', () => {
  const tracking = read('src/lib/purchaseTracking.ts');
  const canonical = read('src/lib/canonicalPurchaseTracking.ts');

  assert.match(tracking, /order\.isTestOrder === true/);
  assert.match(tracking, /inFlight\.has\(key\)/);
  assert.match(tracking, /hasStoredKey\(key\)/);
  assert.match(canonical, /isTestOrder: order\.is_test_order === true/);
});
