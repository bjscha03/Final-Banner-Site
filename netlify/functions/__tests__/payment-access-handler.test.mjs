import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { _test as paymentStatusTest } from '../paypal-payment-status.mjs';

const require = createRequire(import.meta.url);
const captureModule = require('../_shared/legacy/paypal-capture-final.cjs');

const trackedEnvNames = [
  'NETLIFY_DATABASE_URL',
  'FEATURE_PAYPAL',
  'CONTEXT',
  'PAYPAL_ENV',
  'PAYPAL_CLIENT_ID_SANDBOX',
  'PAYPAL_SECRET_SANDBOX',
  'ORDER_CONFIRMATION_TOKEN_SECRET',
  'ORDER_VIEW_TOKEN_SECRET',
  'AUTH_SESSION_SECRET',
  'CLOUDINARY_API_SECRET',
];
const originalEnv = Object.fromEntries(trackedEnvNames.map((name) => [name, process.env[name]]));

const paidOrder = {
  id: '86cd85b5-8f8e-4a72-8d63-243dadfc9914',
  status: 'paid',
  subtotal_cents: 10000,
  tax_cents: 300,
  total_cents: 10300,
  currency: 'USD',
  email: 'customer@example.com',
  customer_name: 'Customer One',
  customer_first_name: 'Customer',
  customer_phone: null,
  shipping_name: 'Customer One',
  shipping_street: '1 Main St',
  shipping_street2: null,
  shipping_city: 'Bozeman',
  shipping_state: 'MT',
  shipping_zip: '59715',
  shipping_country: 'US',
  paypal_order_id: 'PAYPAL-ORDER-123',
  paypal_capture_id: 'PAYPAL-CAPTURE-456',
  payment_method: 'paypal',
  stripe_payment_intent_id: null,
  checkout_idempotency_key: '12345678-1234-4234-9234-123456789abc',
  payment_reconciliation_status: 'complete',
  confirmation_email_status: null,
  admin_notification_status: null,
};

const queryText = (first) => Array.isArray(first) ? first.join('?') : String(first || '');

function captureDatabase(order = paidOrder) {
  const sql = async (first) => {
    const query = queryText(first);
    if (/^\s*SELECT[\s\S]+FROM\s+orders/i.test(query)) return [order];
    if (/^\s*UPDATE\s+orders[\s\S]+RETURNING/i.test(query)) return [order];
    return [];
  };
  return () => sql;
}

function statusDatabase(order = { ...paidOrder, checkout_idempotency_key: 'correct-checkout-key' }) {
  const sql = async (first) => {
    const query = queryText(first);
    if (/FROM\s+orders/i.test(query)) return [order];
    return [];
  };
  return () => sql;
}

test.before(() => {
  process.env.NETLIFY_DATABASE_URL = 'postgres://handler-test.invalid/database';
  process.env.FEATURE_PAYPAL = '1';
  process.env.CONTEXT = 'branch-deploy';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.PAYPAL_CLIENT_ID_SANDBOX = 'sandbox-client-id';
  process.env.PAYPAL_SECRET_SANDBOX = 'sandbox-secret';
});

test.after(() => {
  captureModule._test.resetNeonFactory();
  paymentStatusTest.resetNeonFactory();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('a completed PayPal capture stays a 200 paid success when every token secret is missing', async () => {
  for (const name of [
    'ORDER_CONFIRMATION_TOKEN_SECRET',
    'ORDER_VIEW_TOKEN_SECRET',
    'AUTH_SESSION_SECRET',
    'CLOUDINARY_API_SECRET',
  ]) delete process.env[name];
  captureModule._test.setNeonFactory(captureDatabase());

  const response = await captureModule.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      orderID: paidOrder.paypal_order_id,
      internalOrderId: paidOrder.id,
      checkoutKey: paidOrder.checkout_idempotency_key,
    }),
  });
  const payload = JSON.parse(response.body || '{}');

  assert.equal(response.statusCode, 200);
  assert.equal(payload.paymentCaptured, true);
  assert.equal(payload.captureStatus, 'COMPLETED');
  assert.equal(payload.doNotRetry, false);
  assert.equal(typeof payload.orderConfirmationToken, 'string');
  assert.equal(payload.orderConfirmationTokenAvailable, true);
  assert.equal(payload.orderAccessRecovery, null);
});

test('payment-status handler rejects a bad checkout key before reconciliation or capture', async () => {
  paymentStatusTest.setNeonFactory(statusDatabase());
  const response = await paymentStatusTest.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      internalOrderId: paidOrder.id,
      checkoutKey: 'wrong-checkout-key',
    }),
  });
  const payload = JSON.parse(response.body || '{}');

  assert.equal(response.statusCode, 401);
  assert.equal(payload.error, 'CHECKOUT_CONFIRMATION_REQUIRED');
});

test('public capture rejects a bad checkout key before provider access', async () => {
  captureModule._test.setNeonFactory(captureDatabase());
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    throw new Error('provider must not be called');
  };
  try {
    const response = await captureModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        orderID: paidOrder.paypal_order_id,
        internalOrderId: paidOrder.id,
        checkoutKey: 'wrong-checkout-key',
      }),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, 'CHECKOUT_CONFIRMATION_REQUIRED');
    assert.equal(providerCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('already-paid capture retry is immutable and performs no customer/address update', async () => {
  let writes = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/^\s*SELECT[\s\S]+FROM\s+orders/i.test(query)) return [paidOrder];
    if (/^\s*UPDATE\s+orders/i.test(query)) writes += 1;
    return [];
  };
  captureModule._test.setNeonFactory(() => sql);

  const response = await captureModule.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      orderID: paidOrder.paypal_order_id,
      internalOrderId: paidOrder.id,
      checkoutKey: paidOrder.checkout_idempotency_key,
      customerInfo: { email: 'attacker@example.com', street: 'Attacker address' },
      shippingAddress: { street: 'Attacker address' },
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).alreadyPaid, true);
  assert.equal(writes, 0);
});

test('unknown capture status remains locked while verified completion remains a success', () => {
  const uncertain = captureModule._test.verificationPayload(
    paidOrder.paypal_order_id,
    paidOrder.id,
  );
  const completed = captureModule._test.successPayload(
    { ...paidOrder, checkout_idempotency_key: 'random-checkout-key' },
    null,
    { captureId: paidOrder.paypal_capture_id, amountCents: 10300, currency: 'USD' },
    'live',
    true,
  );

  assert.equal(uncertain.paymentStatusUnknown, true);
  assert.equal(uncertain.reconciliationRequired, true);
  assert.equal(uncertain.doNotRetry, true);
  assert.equal(completed.paymentCaptured, true);
  assert.equal(completed.captureStatus, 'COMPLETED');
  assert.equal(completed.doNotRetry, false);
});
