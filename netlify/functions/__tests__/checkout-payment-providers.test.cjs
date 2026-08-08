'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const absolute = (relativePath) => path.join(repoRoot, relativePath);
const read = (relativePath) => fs.readFileSync(absolute(relativePath), 'utf8');

test('checkout preserves the reliable inline PayPal implementation', () => {
  const viteConfig = read('vite.config.ts');
  const checkout = read('src/pages/Checkout.tsx');
  const paypalCheckout = read('src/components/checkout/PayPalCheckoutReliable.tsx');
  const paypalConfig = read('netlify/functions/_shared/legacy/paypal-config.cjs');

  assert.match(viteConfig, /PayPalCheckoutReliable\.tsx/);
  assert.match(checkout, /@\/components\/checkout\/PayPalCheckoutReliable/);

  for (const label of [
    'First Name *',
    'Last Name *',
    'Email *',
    'Phone *',
    'Street Address *',
    'City *',
    'State *',
    'ZIP *',
    'Shipping address is the same as billing',
    'Shipping Address *',
    'Pay Now',
  ]) {
    assert.ok(paypalCheckout.includes(label), `missing PayPal checkout copy: ${label}`);
  }

  assert.match(paypalCheckout, /PayPalCardFieldsProvider/);
  assert.match(paypalCheckout, /PayPalCardFieldsForm/);
  assert.match(paypalCheckout, /renderPayPalButton\(\)/);
  assert.match(paypalCheckout, /VERIFICATION_POLL_INTERVAL_MS = 2000/);
  assert.match(paypalCheckout, /VERIFICATION_MAX_ATTEMPTS = 15/);
  assert.match(paypalConfig, /components:\s*'buttons,card-fields'/);
  assert.match(paypalCheckout, /components:\s*paypalOnly\s*\?\s*'buttons'\s*:\s*'buttons,card-fields'/);
  assert.match(checkout, /cardFirstLayout/);
  assert.doesNotMatch(paypalCheckout, /fastlane/i);
  assert.doesNotMatch(paypalConfig, /fastlane/i);
});

test('PayPal remains production-contained and queues the existing paid-order follow-ups', () => {
  const runtime = read('netlify/functions/_shared/paypal-runtime-config.cjs');
  const createOrder = read('netlify/functions/_shared/legacy/paypal-create-order-forward.cjs');
  const capture = read('netlify/functions/_shared/legacy/paypal-capture-final.cjs');
  const captureEntrypoint = read('netlify/functions/paypal-capture-minimal.mjs');
  const compatibilityCapture = read('netlify/functions/paypal-capture-order.mjs');
  const redirects = read('public/_redirects');
  const checkout = read('src/components/checkout/PayPalCheckoutReliable.tsx');

  assert.match(runtime, /\['live', 'production', 'prod'\]/);
  assert.match(runtime, /PAYPAL_CLIENT_ID_\$\{suffix\}/);
  assert.match(runtime, /PAYPAL_SECRET_\$\{suffix\}/);
  assert.match(createOrder, /shipping_preference:\s*'GET_FROM_FILE'/);
  assert.match(createOrder, /user_action:\s*'PAY_NOW'/);
  assert.match(capture, /extractCustomerEmail\(paypalData\)/);
  assert.match(capture, /extractShippingAddress\(paypalData\)/);
  assert.match(captureEntrypoint, /queuePaidOrderFollowups\(event, internalOrderId\)/);
  assert.match(captureEntrypoint, /followupsQueued/);
  assert.match(compatibilityCapture, /export \{ default \} from '\.\/paypal-capture-minimal\.mjs'/);
  assert.doesNotMatch(compatibilityCapture, /paypal-capture-order\.cjs|paypal-capture-forward\.cjs/);
  const createAlias = redirects.indexOf('/api/paypal/create-order');
  const captureAlias = redirects.indexOf('/api/paypal/capture-order');
  const broadApiRewrite = redirects.indexOf('/api/*');
  assert.ok(createAlias >= 0 && createAlias < broadApiRewrite);
  assert.ok(captureAlias >= 0 && captureAlias < broadApiRewrite);
  assert.match(createOrder, /constantTimeEqual\(checkoutKey, order\.checkout_idempotency_key\)/);
  assert.match(capture, /constantTimeEqual\(checkoutKey, order\.checkout_idempotency_key\)/);
  assert.ok((checkout.match(/checkoutKey:\s*checkoutKeyRef\.current/g) || []).length >= 3);
});

test('PayPal pending orders use the same registry repricer before persistence', () => {
  const core = read('netlify/functions/_shared/legacy/create-order-core.cjs');
  const forward = read('netlify/functions/_shared/legacy/paypal-create-order-forward.cjs');

  assert.match(core, /trustedStripeMode \|\| isPayPalPendingCheckout/);
  assert.match(core, /orderData\.items = repriceCheckoutCart\(orderData\.items\)/);
  assert.match(core, /isSecureCheckoutKey\(orderData\.checkout_idempotency_key\)/);
  assert.match(core, /canonicalQuote/);
  assert.match(forward, /repriceCheckoutCart\(persistedItems\)/);
  assert.match(forward, /STALE_CART_TOTAL/);
});

test('Stripe UI uses deferred Elements with one Express wallet surface and one card surface', () => {
  const packageJson = JSON.parse(read('package.json'));
  const stripeCheckout = read('src/components/checkout/StripeCheckout.tsx');

  assert.ok(packageJson.dependencies?.['@stripe/stripe-js']);
  assert.ok(packageJson.dependencies?.['@stripe/react-stripe-js']);
  assert.ok(packageJson.dependencies?.stripe);
  assert.match(stripeCheckout, /@stripe\/react-stripe-js/);
  assert.match(stripeCheckout, /loadStripe/);
  assert.match(stripeCheckout, /ExpressCheckoutElement/);
  assert.match(stripeCheckout, /PaymentElement/);
  assert.match(stripeCheckout, /createConfirmationToken/);
  assert.match(stripeCheckout, /elements\.submit\(\)/);
  assert.match(stripeCheckout, /stripe\.handleNextAction\s*\(/);
  assert.doesNotMatch(stripeCheckout, /stripe\.confirmPayment\s*\(/);
  assert.match(stripeCheckout, /onAvailablePaymentMethodsChange/);
  assert.match(stripeCheckout, /applePay:\s*['"]never['"]/);
  assert.match(stripeCheckout, /googlePay:\s*['"]never['"]/);
  assert.doesNotMatch(stripeCheckout, /trackPurchase|attemptPurchaseTracking|purchase\s*\(/);
});

test('checkout loads Stripe configuration at runtime without a Vite-bundled key', () => {
  const checkout = read('src/pages/Checkout.tsx');
  const envExample = read('.env.example');

  assert.match(checkout, /\.netlify\/functions\/stripe-config/);
  assert.doesNotMatch(checkout, /VITE_STRIPE_PUBLISHABLE_KEY/);
  assert.match(checkout, /PayPalCheckout/);
  assert.match(checkout, /StripeCheckout/);
  assert.doesNotMatch(envExample, /^VITE_STRIPE_/m);
  assert.match(envExample, /^STRIPE_CHECKOUT_ENABLED=false$/m);
  assert.match(envExample, /^STRIPE_MODE=test$/m);
  assert.match(envExample, /^STRIPE_PUBLISHABLE_KEY=$/m);
  assert.match(envExample, /^STRIPE_SECRET_KEY=$/m);
  assert.match(envExample, /^STRIPE_WEBHOOK_SECRET=$/m);
});

test('Stripe recovery state is cart-bound, expiring, and never persists a client secret', () => {
  const state = read('src/components/checkout/stripeCheckoutState.ts');

  assert.match(state, /STRIPE_CHECKOUT_STATE_TTL_MS/);
  assert.match(state, /sessionStorage/);
  assert.match(state, /crypto\.randomUUID/);
  assert.match(state, /crypto\.getRandomValues/);
  assert.match(state, /paymentIntentId/);
  assert.match(state, /checkoutKey/);
  assert.doesNotMatch(state, /clientSecret/);
  assert.doesNotMatch(state, /localStorage/);
});

test('Stripe server entrypoints, pricing, signature verification, and status recovery are present', () => {
  const requiredFiles = [
    'netlify/functions/stripe-config.mjs',
    'netlify/functions/stripe-create-payment-intent.mjs',
    'netlify/functions/stripe-finalize-order.mjs',
    'netlify/functions/stripe-payment-status.mjs',
    'netlify/functions/stripe-webhook.mjs',
    'netlify/functions/_shared/stripe-runtime-config.cjs',
    'netlify/functions/_shared/stripe-server-pricing.cjs',
    'netlify/functions/_shared/stripe-checkout-service.cjs',
  ];

  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(absolute(file)), true, `missing Stripe payment file: ${file}`);
  }

  const publicConfig = read('netlify/functions/stripe-config.mjs');
  const runtime = read('netlify/functions/_shared/stripe-runtime-config.cjs');
  const pricing = read('netlify/functions/_shared/stripe-server-pricing.cjs');
  const checkoutService = read('netlify/functions/_shared/stripe-checkout-service.cjs');
  const createIntent = read('netlify/functions/stripe-create-payment-intent.mjs');
  const finalize = read('netlify/functions/stripe-finalize-order.mjs');
  const status = read('netlify/functions/stripe-payment-status.mjs');
  const webhook = read('netlify/functions/stripe-webhook.mjs');
  const createFlow = `${createIntent}\n${checkoutService}`;
  const configFlow = `${publicConfig}\n${runtime}`;

  assert.match(configFlow, /publishableKey/);
  assert.doesNotMatch(publicConfig, /secretKey\s*:/);
  assert.doesNotMatch(publicConfig, /webhookSecret\s*:/);
  assert.match(runtime, /STRIPE_CHECKOUT_ENABLED/);
  assert.match(runtime, /STRIPE_MODE/);
  assert.match(runtime, /pk_test_|pk_live_/);
  assert.match(runtime, /sk_test_|sk_live_/);
  assert.match(runtime, /STRIPE_WEBHOOK_SECRET/);
  assert.match(runtime, /options\.requireEnabledFlag !== false/);
  assert.match(pricing, /line_total_cents/);
  assert.match(pricing, /total_cents/);
  assert.match(checkoutService, /paymentIntents|payment_intents/i);
  assert.match(checkoutService, /idempotenc/i);
  assert.match(checkoutService, /paymentIntents\.confirm\s*\(/);
  assert.match(checkoutService, /use_stripe_sdk:\s*true/);
  const metadata = checkoutService.match(/metadata:\s*\{([\s\S]*?)\n\s*\},\n\s*shipping:/)?.[1];
  assert.ok(metadata, 'PaymentIntent metadata block must remain reviewable');
  assert.doesNotMatch(metadata, /email|phone|address|first.?name|last.?name/i);
  assert.doesNotMatch(checkoutService, /receipt_email\s*:/);
  assert.match(createFlow, /confirmation[_A-Za-z]*token/i);
  assert.match(createFlow, /idempotenc/i);
  assert.match(status, /checkoutKey|checkout_key/);
  assert.match(status, /paymentIntent|payment_intent/i);
  assert.match(finalize, /requireEnabledFlag:\s*false/);
  assert.match(status, /requireEnabledFlag:\s*false/);
  assert.match(webhook, /requireEnabledFlag:\s*false/);
  assert.doesNotMatch(createIntent, /requireEnabledFlag:\s*false/);
  assert.match(webhook, /constructEvent/);
  assert.match(webhook, /stripe-signature/i);
  assert.match(webhook, /payment_intent\.succeeded/);
});

test('success analytics and Admin visibility stay canonical and provider-neutral', () => {
  const success = read('src/pages/PaymentSuccess.tsx');
  const tracking = read('src/lib/purchaseTracking.ts');
  const canonical = read('src/lib/canonicalPurchaseTracking.ts');
  const adminVisibility = read('netlify/functions/_shared/admin-order-visibility.cjs');
  const getOrders = read('netlify/functions/get-orders.mjs');

  assert.match(success, /const canonicalOrderId = loadedOrder\?\.id \|\| null/);
  assert.match(success, /attemptCanonicalPurchaseTracking\(canonicalOrderId, loadedOrder/);
  assert.match(tracking, /order\.isTestOrder === true/);
  assert.match(tracking, /inFlight\.has\(key\)/);
  assert.match(tracking, /hasStoredKey\(key\)/);
  assert.match(canonical, /isTestOrder: order\.is_test_order === true/);
  assert.match(adminVisibility, /PAID_ADMIN_STATUSES/);
  assert.match(adminVisibility, /order\.is_test_order === true/);
  assert.match(getOrders, /stripe_payment_intent_id/);
  assert.match(getOrders, /stripe_wallet_type/);
});

test('secret-bearing environment files are removed and future variants are ignored', () => {
  const gitignore = read('.gitignore');

  assert.equal(fs.existsSync(absolute('.env')), false);
  assert.equal(fs.existsSync(absolute('.env.backup')), false);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test('a future CSP cannot silently omit required Stripe origins', () => {
  const netlifyConfig = read('netlify.toml');
  if (!/Content-Security-Policy/i.test(netlifyConfig)) return;

  assert.match(netlifyConfig, /https:\/\/js\.stripe\.com/);
  assert.match(netlifyConfig, /https:\/\/hooks\.stripe\.com/);
  assert.match(netlifyConfig, /https:\/\/api\.stripe\.com/);
  assert.match(netlifyConfig, /paypal\.com/);
});
