'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const getOrdersModule = require('../_shared/legacy/get-orders.cjs');
const { createSessionToken } = require('../_shared/server-auth.cjs');

const originalEnv = {
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  DEBUG_ORDERS: process.env.DEBUG_ORDERS,
};

const order = {
  id: '86cd85b5-8f8e-4a72-8d63-243dadfc9914',
  user_id: 'customer-1',
  email: 'customer@example.com',
  customer_name: 'Customer One',
  subtotal_cents: 10000,
  tax_cents: 300,
  total_cents: 10300,
  status: 'paid',
  payment_method: 'paypal',
  payment_reconciliation_status: 'complete',
  paypal_order_id: 'PAYPAL-ORDER-123',
  paypal_capture_id: 'PAYPAL-CAPTURE-456',
  stripe_payment_intent_id: null,
  stripe_charge_id: null,
  created_at: '2026-08-06T18:00:00.000Z',
  items: [{ id: 'item-1', quantity: 1, width_in: 36, height_in: 72 }],
};

const orderColumns = [
  'id', 'user_id', 'email', 'customer_name', 'status', 'payment_method',
  'paypal_order_id', 'paypal_capture_id', 'stripe_charge_id', 'created_at',
];
const itemColumns = ['id', 'width_in', 'height_in', 'quantity'];

function queryText(first) {
  return Array.isArray(first) ? first.join('?') : String(first || '');
}

function database(observedQueries) {
  const sql = async (first) => {
    const query = queryText(first);
    observedQueries.push(query);
    if (/attrelid\s*=\s*'orders'::regclass/i.test(query)) {
      return orderColumns.map((column_name) => ({ column_name }));
    }
    if (/attrelid\s*=\s*'order_items'::regclass/i.test(query)) {
      return itemColumns.map((column_name) => ({ column_name }));
    }
    if (/FROM\s+orders\s+o/i.test(query)) return [order];
    throw new Error(`Unexpected legacy get-orders SQL: ${query}`);
  };
  return () => sql;
}

function event(token, queryStringParameters = {}) {
  return {
    httpMethod: 'GET',
    headers: { authorization: `Bearer ${token}` },
    queryStringParameters,
  };
}

function bodyOf(response) {
  return JSON.parse(response.body || 'null');
}

test.before(() => {
  process.env.NETLIFY_DATABASE_URL = 'postgres://legacy-orders-test.invalid/database';
  process.env.AUTH_SESSION_SECRET = 'legacy-orders-auth-secret';
  delete process.env.DEBUG_ORDERS;
});

test.after(() => {
  getOrdersModule._test.resetNeonFactory();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('legacy owner and Admin list reads are SELECT-only and preserve auth and array shape', async () => {
  const queries = [];
  getOrdersModule._test.setNeonFactory(database(queries));
  const owner = createSessionToken({ id: order.user_id, email: order.email, is_admin: false });
  const outsider = createSessionToken({ id: 'customer-2', email: 'other@example.com', is_admin: false });
  const admin = createSessionToken({ id: 'admin-1', email: 'admin@example.com', is_admin: true });

  const ownerResponse = await getOrdersModule.handler(event(owner, { user_id: order.user_id, page: '1' }));
  const adminResponse = await getOrdersModule.handler(event(admin, { page: '1' }));
  const outsiderResponse = await getOrdersModule.handler(event(outsider, { user_id: order.user_id, page: '1' }));
  const ownerOrders = bodyOf(ownerResponse);
  const adminOrders = bodyOf(adminResponse);

  assert.equal(ownerResponse.statusCode, 200);
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(outsiderResponse.statusCode, 401);
  assert.ok(Array.isArray(ownerOrders));
  assert.ok(Array.isArray(adminOrders));
  assert.equal(ownerOrders[0].id, order.id);
  assert.equal(adminOrders[0].id, order.id);
  assert.equal(ownerOrders[0].payment_reconciliation_status, 'complete');
  assert.deepEqual(ownerOrders[0].items, order.items);
  assert.ok(queries.length > 0);
  for (const query of queries) {
    assert.match(query.trim(), /^SELECT\b/i);
    assert.doesNotMatch(query, /\b(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i);
  }
});
