import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test',
  CONTEXT: 'deploy-preview',
  STRIPE_MODE: 'test',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  ORDER_CONFIRMATION_TOKEN_SECRET: 'confirmation-secret',
  INTERNAL_JOB_SECRET: 'job-secret',
});

const statusModule = await import('../stripe-payment-status.mjs');
const finalizeModule = await import('../stripe-finalize-order.mjs');
const webhookModule = await import('../stripe-webhook.mjs');
const configModule = await import('../stripe-config.mjs');
const createModule = await import('../stripe-create-payment-intent.mjs');
const followupModule = (await import('../_shared/paid-order-followups.cjs')).default;

const makeOrder = () => ({
  id: 'order-123',
  user_id: null,
  status: 'pending',
  subtotal_cents: 10000,
  tax_cents: 600,
  total_cents: 10600,
  email: 'buyer@example.com',
  customer_name: 'Buyer Name',
  customer_phone: '5025550100',
  shipping_name: 'Buyer Name',
  shipping_street: '100 Main St',
  shipping_street2: null,
  shipping_city: 'Louisville',
  shipping_state: 'KY',
  shipping_zip: '40202',
  shipping_country: 'US',
  discount_code: null,
  applied_discount_cents: 0,
  applied_discount_label: '',
  applied_discount_type: 'none',
  shipping_cents: 0,
  same_day_fee_cents: 0,
  saturday_fee_cents: 0,
  checkout_idempotency_key: 'checkout_key_12345678901234567890',
  stripe_payment_intent_id: 'pi_123',
  stripe_charge_id: null,
  stripe_wallet_type: null,
  payment_method: 'stripe',
  payment_reconciliation_status: 'awaiting_confirmation',
  confirmation_email_status: 'pending',
  admin_notification_status: 'pending',
  is_test_order: true,
  created_at: new Date().toISOString(),
});

const makeIntent = (status = 'succeeded') => ({
  id: 'pi_123',
  status,
  amount: 10600,
  currency: 'usd',
  livemode: false,
  latest_charge: status === 'succeeded' ? {
    id: 'ch_123',
    payment_method_details: { card: { wallet: { type: 'google_pay' } } },
  } : null,
  metadata: {
    bof_checkout: 'v2',
    internal_order_id: 'order-123',
    // checkout hash filled per-test when browser binding is required
  },
});

function fakeSql(order) {
  let paidTransitions = 0;
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (/^\s*SELECT /i.test(query)) return order ? [{ ...order }] : [];
    if (/SET status = 'paid'/i.test(query)) {
      if (!order || order.status !== 'pending') return [];
      order.status = 'paid';
      order.stripe_charge_id = 'ch_123';
      order.stripe_wallet_type = 'google_pay';
      order.payment_reconciliation_status = 'complete';
      paidTransitions += 1;
      return [{ id: order.id }];
    }
    if (/SET stripe_charge_id/i.test(query) && order) {
      order.stripe_charge_id ||= 'ch_123';
      order.stripe_wallet_type ||= 'google_pay';
      order.payment_reconciliation_status = 'complete';
      return [];
    }
    return [];
  };
  return { sql, getPaidTransitions: () => paidTransitions };
}

const post = (body, extraHeaders = {}) => ({
  httpMethod: 'POST',
  headers: { host: 'deploy-preview-1--bof.netlify.app', ...extraHeaders },
  body: JSON.stringify(body),
});

const successfulFollowupFetch = async (url) => {
  return {
    ok: true,
    status: 202,
    async json() { throw new Error('empty background response'); },
  };
};

const successfulNotifyOrder = async () => ({
  statusCode: 200,
  body: JSON.stringify({ ok: true, customerEmailSent: true, adminEmailSent: true }),
});

test('wrapped browser Stripe functions return a valid empty preflight response', async () => {
  const functions = [
    ['stripe-config', configModule.default],
    ['stripe-create-payment-intent', createModule.default],
    ['stripe-finalize-order', finalizeModule.default],
    ['stripe-payment-status', statusModule.default],
  ];
  for (const [name, wrappedHandler] of functions) {
    const response = await wrappedHandler(new Request(
      `https://deploy-preview-1--bof.netlify.app/.netlify/functions/${name}`,
      { method: 'OPTIONS' },
    ), {});
    assert.equal(response.status, 200, name);
    assert.equal(await response.text(), '', name);
  }

  const webhookResponse = await webhookModule.default(new Request(
    'https://deploy-preview-1--bof.netlify.app/.netlify/functions/stripe-webhook',
    { method: 'OPTIONS' },
  ), {});
  assert.equal(webhookResponse.status, 405);
});

test('status recovery refuses a wrong checkout key before calling Stripe', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  let retrieveCalls = 0;
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({
    paymentIntents: { async retrieve() { retrieveCalls += 1; return makeIntent('processing'); } },
  }));
  const response = await statusModule._test.handler(post({
    orderId: order.id,
    paymentIntentId: order.stripe_payment_intent_id,
    checkoutKey: 'wrong_checkout_key_1234567890123',
  }));
  assert.equal(response.statusCode, 404);
  assert.equal(retrieveCalls, 0);
});

test('status fails closed without enabling another charge when provider binding is inconsistent', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const checkoutModule = await import('../_shared/stripe-checkout-service.cjs');
  const intent = { ...makeIntent('succeeded'), amount: 1 };
  intent.metadata.checkout_key_hash = checkoutModule.default.checkoutKeyHash(order.checkout_idempotency_key);
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({ paymentIntents: { async retrieve() { return intent; } } }));
  const response = await statusModule._test.handler(post({
    orderId: order.id,
    paymentIntentId: order.stripe_payment_intent_id,
    checkoutKey: order.checkout_idempotency_key,
  }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(payload.doNotRetry, true);
  assert.equal(payload.paymentStatusUnknown, true);
  assert.equal(db.getPaidTransitions(), 0);
});

test('status reports provider processing without enabling a duplicate payment', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const checkoutModule = await import('../_shared/stripe-checkout-service.cjs');
  const intent = makeIntent('processing');
  intent.metadata.checkout_key_hash = checkoutModule.default.checkoutKeyHash(order.checkout_idempotency_key);
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({ paymentIntents: { async retrieve() { return intent; } } }));
  const response = await statusModule._test.handler(post({
    checkoutKey: order.checkout_idempotency_key,
  }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.paid, false);
  assert.equal(payload.pending, true);
  assert.equal(payload.retryable, false);
  assert.equal(payload.activePayment, true);
  assert.equal(payload.orderId, order.id);
  assert.equal(payload.paymentIntentId, order.stripe_payment_intent_id);
});

test('status returns the safe Stripe decline code needed for an actionable retry message', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const checkoutModule = await import('../_shared/stripe-checkout-service.cjs');
  const intent = {
    ...makeIntent('requires_payment_method'),
    last_payment_error: {
      code: 'card_declined',
      decline_code: 'insufficient_funds',
      message: 'provider text is intentionally not returned',
    },
  };
  intent.metadata.checkout_key_hash = checkoutModule.default.checkoutKeyHash(order.checkout_idempotency_key);
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({ paymentIntents: { async retrieve() { return intent; } } }));
  const response = await statusModule._test.handler(post({ checkoutKey: order.checkout_idempotency_key }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.status, 'requires_payment_method');
  assert.equal(payload.providerCode, 'card_declined');
  assert.equal(payload.declineCode, 'insufficient_funds');
  assert.equal(payload.safeToRetry, true);
  assert.equal(payload.message, 'Payment was not completed. You can safely try again.');
  assert.equal(JSON.stringify(payload).includes('provider text'), false);
});

test('checkout-key-only recovery clears a marker when no provider Intent was ever bound', async () => {
  const order = makeOrder();
  order.stripe_payment_intent_id = null;
  const db = fakeSql(order);
  let retrieveCalls = 0;
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({
    paymentIntents: { async retrieve() { retrieveCalls += 1; return makeIntent('processing'); } },
  }));
  const response = await statusModule._test.handler(post({
    checkoutKey: order.checkout_idempotency_key,
  }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.status, 'not_started');
  assert.equal(payload.activePayment, false);
  assert.equal(payload.safeToRetry, true);
  assert.equal(payload.orderId, order.id);
  assert.equal(retrieveCalls, 0);
});

test('status can resume a bound requires-action payment without creating another charge', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const checkoutModule = await import('../_shared/stripe-checkout-service.cjs');
  const intent = {
    ...makeIntent('requires_action'),
    client_secret: 'pi_123_secret_recovery',
  };
  intent.metadata.checkout_key_hash = checkoutModule.default.checkoutKeyHash(order.checkout_idempotency_key);
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({ paymentIntents: { async retrieve() { return intent; } } }));
  const response = await statusModule._test.handler(post({
    orderId: order.id,
    paymentIntentId: order.stripe_payment_intent_id,
    checkoutKey: order.checkout_idempotency_key,
  }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.paid, false);
  assert.equal(payload.pending, true);
  assert.equal(payload.retryable, false);
  assert.equal(payload.requiresAction, true);
  assert.equal(payload.clientSecret, intent.client_secret);
});

test('status recovery atomically finalizes a succeeded payment and returns the canonical confirmation token', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const checkoutModule = await import('../_shared/stripe-checkout-service.cjs');
  const intent = makeIntent('succeeded');
  intent.metadata.checkout_key_hash = checkoutModule.default.checkoutKeyHash(order.checkout_idempotency_key);
  statusModule._test.setNeonFactory(() => db.sql);
  statusModule._test.setStripeFactory(() => ({ paymentIntents: { async retrieve() { return intent; } } }));
  const previousFetch = global.fetch;
  global.fetch = successfulFollowupFetch;
  followupModule.setNotifyOrderHandler(successfulNotifyOrder);
  try {
    const response = await statusModule._test.handler(post({
      orderId: order.id,
      paymentIntentId: order.stripe_payment_intent_id,
      checkoutKey: order.checkout_idempotency_key,
    }));
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.paid, true);
    assert.equal(payload.finalized, true);
    assert.equal(payload.orderId, order.id);
    assert.equal(typeof payload.confirmationToken, 'string');
    assert.ok(payload.confirmationToken.includes('.'));
    assert.equal(db.getPaidTransitions(), 1);
  } finally {
    followupModule.resetNotifyOrderHandler();
    global.fetch = previousFetch;
  }
});

test('a captured payment reconciliation failure never returns a terminal retry-payment response', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const checkoutModule = await import('../_shared/stripe-checkout-service.cjs');
  const intent = { ...makeIntent('succeeded'), livemode: true };
  intent.metadata.checkout_key_hash = checkoutModule.default.checkoutKeyHash(order.checkout_idempotency_key);
  finalizeModule._test.setNeonFactory(() => db.sql);
  finalizeModule._test.setStripeFactory(() => ({ paymentIntents: { async retrieve() { return intent; } } }));
  const response = await finalizeModule._test.handler(post({
    orderId: order.id,
    paymentIntentId: order.stripe_payment_intent_id,
    checkoutKey: order.checkout_idempotency_key,
  }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(payload.paid, true);
  assert.equal(payload.finalized, false);
  assert.equal(payload.paymentCaptured, true);
  assert.equal(payload.doNotRetry, true);
  assert.equal(payload.status, 'succeeded');
  assert.equal(db.getPaidTransitions(), 0);
});

test('webhook rejects unsigned requests', async () => {
  const response = await webhookModule._test.handler(post({}));
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, 'MISSING_SIGNATURE');
});

test('signed success settles once, is retry-idempotent, and queues follow-ups', async () => {
  const order = makeOrder();
  const db = fakeSql(order);
  const intent = makeIntent('succeeded');
  const stripeEvent = {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    data: { object: intent },
  };
  let fetchCalls = 0;
  const previousFetch = global.fetch;
  followupModule.setNotifyOrderHandler(successfulNotifyOrder);
  global.fetch = async (url) => {
    fetchCalls += 1;
    return successfulFollowupFetch(url);
  };
  webhookModule._test.setNeonFactory(() => db.sql);
  webhookModule._test.setStripeFactory(() => ({
    webhooks: {
      constructEvent(raw, signature, secret) {
        assert.equal(raw, '{"signed":true}');
        assert.equal(signature, 'valid-signature');
        assert.equal(secret, 'whsec_example');
        return stripeEvent;
      },
    },
    paymentIntents: { async retrieve() { return intent; } },
  }));
  try {
    const event = {
      httpMethod: 'POST',
      headers: { host: 'deploy-preview-1--bof.netlify.app', 'stripe-signature': 'valid-signature' },
      body: '{"signed":true}',
    };
    const first = await webhookModule._test.handler(event);
    const retry = await webhookModule._test.handler(event);
    assert.equal(first.statusCode, 200);
    assert.equal(retry.statusCode, 200);
    assert.equal(db.getPaidTransitions(), 1);
    assert.equal(order.stripe_wallet_type, 'google_pay');
    assert.equal(fetchCalls, 2);
  } finally {
    followupModule.resetNotifyOrderHandler();
    global.fetch = previousFetch;
  }
});

test('authenticated paid event returns non-2xx when its order cannot be fulfilled', async () => {
  const intent = makeIntent('succeeded');
  webhookModule._test.setNeonFactory(() => async () => []);
  webhookModule._test.setStripeFactory(() => ({
    webhooks: { constructEvent() { return { id: 'evt_missing', type: 'payment_intent.succeeded', data: { object: intent } }; } },
    paymentIntents: { async retrieve() { return intent; } },
  }));
  const response = await webhookModule._test.handler({
    httpMethod: 'POST',
    headers: { 'stripe-signature': 'valid-signature' },
    body: '{}',
  });
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).error, 'ORDER_NOT_FOUND');
});

test.after(() => {
  followupModule.resetNotifyOrderHandler();
  statusModule._test.resetFactories();
  finalizeModule._test.resetFactories();
  webhookModule._test.resetFactories();
});
