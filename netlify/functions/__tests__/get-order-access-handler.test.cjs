'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const getOrderModule = require('../_shared/legacy/get-order.cjs');
const { createSessionToken } = require('../_shared/server-auth.cjs');
const {
  ORDER_VIEW_TTL_SECONDS,
  createGuestOrderViewToken,
  createPaidOrderConfirmationToken,
} = require('../_shared/order-confirmation-token.cjs');

const originalEnv = {
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  ORDER_VIEW_TOKEN_SECRET: process.env.ORDER_VIEW_TOKEN_SECRET,
  ORDER_CONFIRMATION_TOKEN_SECRET: process.env.ORDER_CONFIRMATION_TOKEN_SECRET,
};

const order = {
  id: '86cd85b5-8f8e-4a72-8d63-243dadfc9914',
  order_number: 'BOTF-9914',
  user_id: 'customer-1',
  email: 'customer@example.com',
  customer_name: 'Customer One',
  subtotal_cents: 10000,
  tax_cents: 300,
  total_cents: 10300,
  discount_code: 'NEW20',
  status: 'paid',
  payment_method: 'paypal',
  payment_reconciliation_status: 'complete',
  paypal_order_id: 'PAYPAL-ORDER-123',
  paypal_capture_id: 'PAYPAL-CAPTURE-456',
  stripe_payment_intent_id: null,
  stripe_charge_id: null,
  checkout_idempotency_key: 'checkout-key-with-at-least-32-random-characters',
  created_at: '2026-08-06T18:00:00.000Z',
  updated_at: '2026-08-06T18:01:00.000Z',
};

function queryText(first) {
  if (Array.isArray(first)) return first.join('?');
  return String(first || '');
}

function databaseFor(orderRow, observedQueries = null) {
  const sql = async (first) => {
    const query = queryText(first);
    observedQueries?.push(query);
    if (/FROM\s+pg_attribute/i.test(query)) return [];
    if (/FROM\s+orders\s+WHERE\s+id\s*=\s*\$1/i.test(query)) return [orderRow];
    if (/FROM\s+order_items\s+WHERE\s+order_id\s*=\s*\$1/i.test(query)) return [];
    return [];
  };
  return () => sql;
}

function event(headers = {}, query = {}) {
  return {
    httpMethod: 'GET',
    headers,
    queryStringParameters: { id: order.id, ...query },
  };
}

function bodyOf(response) {
  return JSON.parse(response.body || '{}');
}

test.before(() => {
  process.env.NETLIFY_DATABASE_URL = 'postgres://handler-test.invalid/database';
  process.env.AUTH_SESSION_SECRET = 'handler-test-auth-secret';
  process.env.ORDER_VIEW_TOKEN_SECRET = 'handler-test-view-secret';
  process.env.ORDER_CONFIRMATION_TOKEN_SECRET = 'handler-test-confirmation-secret';
});

test.after(() => {
  getOrderModule._test.resetNeonFactory();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('get-order handler accepts a valid fragment-delivered guest view header and strips private binding fields', async () => {
  getOrderModule._test.setNeonFactory(databaseFor(order));
  const token = createGuestOrderViewToken(order);
  const response = await getOrderModule.handler(event({ 'x-order-view-token': token }));
  const payload = bodyOf(response);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.order.id, order.id);
  assert.equal(payload.order.checkout_idempotency_key, undefined);
  assert.equal(payload.order.stripe_payment_intent_id, undefined);
  assert.equal(payload.order.stripe_charge_id, undefined);
  assert.equal(payload.order.discount_code, 'NEW20');
});

test('get-order handler rejects invalid, expired, query-only, and payment-binding-mismatched guest credentials', async () => {
  getOrderModule._test.setNeonFactory(databaseFor(order));
  const valid = createGuestOrderViewToken(order);
  const expired = createGuestOrderViewToken(order, {
    nowSeconds: Math.floor(Date.now() / 1000) - ORDER_VIEW_TTL_SECONDS - 1,
  });
  const cases = [
    event({ 'x-order-view-token': `${valid.slice(0, -1)}x` }),
    event({ 'x-order-view-token': expired }),
    event({}, { orderView: valid }),
  ];

  for (const request of cases) {
    const response = await getOrderModule.handler(request);
    assert.equal(response.statusCode, 401);
  }

  getOrderModule._test.setNeonFactory(databaseFor({ ...order, paypal_capture_id: 'DIFFERENT-CAPTURE' }));
  const mismatch = await getOrderModule.handler(event({ 'x-order-view-token': valid }));
  assert.equal(mismatch.statusCode, 401);
});

test('get-order handler preserves short-lived confirmation, owner, and admin access while rejecting another user', async () => {
  getOrderModule._test.setNeonFactory(databaseFor(order));
  const confirmation = createPaidOrderConfirmationToken(order);
  const owner = createSessionToken({ id: order.user_id, email: order.email, is_admin: false });
  const admin = createSessionToken({ id: 'admin-1', email: 'admin@example.com', is_admin: true });
  const outsider = createSessionToken({ id: 'customer-2', email: 'other@example.com', is_admin: false });

  const confirmationResponse = await getOrderModule.handler(event({
    'x-order-confirmation-token': confirmation,
  }));
  const ownerResponse = await getOrderModule.handler(event({ authorization: `Bearer ${owner}` }));
  const adminResponse = await getOrderModule.handler(event({ authorization: `Bearer ${admin}` }));
  const outsiderResponse = await getOrderModule.handler(event({ authorization: `Bearer ${outsider}` }));

  assert.equal(confirmationResponse.statusCode, 200);
  assert.equal(ownerResponse.statusCode, 200);
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(outsiderResponse.statusCode, 401);
});

test('admin and customer detail reads remain read-only while preserving the full order response', async () => {
  const queries = [];
  getOrderModule._test.setNeonFactory(databaseFor(order, queries));
  const owner = createSessionToken({ id: order.user_id, email: order.email, is_admin: false });
  const admin = createSessionToken({ id: 'admin-1', email: 'admin@example.com', is_admin: true });

  const ownerResponse = await getOrderModule.handler(event({ authorization: `Bearer ${owner}` }));
  const adminResponse = await getOrderModule.handler(event({ authorization: `Bearer ${admin}` }));
  const ownerPayload = bodyOf(ownerResponse);
  const adminPayload = bodyOf(adminResponse);

  assert.equal(ownerResponse.statusCode, 200);
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(ownerPayload.order.id, order.id);
  assert.equal(adminPayload.order.id, order.id);
  assert.equal(ownerPayload.order.payment_reconciliation_status, 'complete');
  assert.equal(adminPayload.order.payment_reconciliation_status, 'complete');
  assert.deepEqual(ownerPayload.order.items, []);
  assert.deepEqual(adminPayload.order.items, []);
  assert.equal(ownerPayload.order.stripe_payment_intent_id, undefined);
  assert.equal(adminPayload.order.stripe_payment_intent_id, null);
  assert.ok(queries.length > 0);
  for (const query of queries) {
    assert.match(query.trim(), /^SELECT\b/i);
    assert.doesNotMatch(query, /\b(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i);
  }
});

test('detail reads never demote tracked or settled legacy rows back to pending', async () => {
  const admin = createSessionToken({ id: 'admin-1', email: 'admin@example.com', is_admin: true });
  const trackedPending = {
    ...order,
    status: 'pending',
    tracking_number: null,
    tracking_numbers: [{ carrier: 'fedex', trackingNumber: '555555555555' }],
  };
  getOrderModule._test.setNeonFactory(databaseFor(trackedPending));
  const trackedResponse = await getOrderModule.handler(event({ authorization: `Bearer ${admin}` }));
  assert.equal(bodyOf(trackedResponse).order.status, 'shipped');

  const capturedPending = { ...order, status: 'pending', tracking_number: null, tracking_numbers: [] };
  getOrderModule._test.setNeonFactory(databaseFor(capturedPending));
  const capturedResponse = await getOrderModule.handler(event({ authorization: `Bearer ${admin}` }));
  assert.equal(bodyOf(capturedResponse).order.status, 'paid');
});
