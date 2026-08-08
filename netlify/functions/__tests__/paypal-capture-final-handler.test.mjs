import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const capture = require('../_shared/legacy/paypal-capture-final.cjs');

const checkoutKey = '12345678-1234-4234-9234-123456789abc';
const pending = {
  id: 'aa5d3451-8285-4327-a832-162ea21bf00b',
  status: 'pending',
  subtotal_cents: 3600,
  tax_cents: 216,
  total_cents: 3816,
  currency: 'USD',
  email: 'original-contact@example.com',
  user_id: null,
  discount_code: null,
  applied_discount_cents: 0,
  applied_discount_type: 'none',
  is_test_order: false,
  created_at: new Date().toISOString(),
  payment_reconciliation_status: 'awaiting_capture',
  customer_name: 'Original Contact',
  customer_first_name: 'Original',
  customer_phone: '5551112222',
  shipping_name: 'Old Recipient',
  shipping_street: 'Old Street',
  shipping_street2: 'Old Suite',
  shipping_city: 'Old City',
  shipping_state: 'NY',
  shipping_zip: '10001',
  shipping_country: 'US',
  paypal_order_id: 'PAYPAL-ORDER-1',
  paypal_capture_id: null,
  stripe_payment_intent_id: null,
  payment_method: 'paypal',
  checkout_idempotency_key: checkoutKey,
};
const capturedOrder = {
  id: pending.paypal_order_id,
  status: 'COMPLETED',
  payer: { email_address: 'wallet@example.com', payer_id: 'PAYER-1' },
  purchase_units: [{
    custom_id: pending.id,
    invoice_id: `BOTF-${pending.id}`,
    amount: { currency_code: 'USD', value: '38.16' },
    shipping: {
      name: { full_name: 'Provider Recipient' },
      address: {
        address_line_1: '500 Provider Avenue',
        // Intentionally no line 2: it must clear the stale checkout suite.
        admin_area_2: 'Buffalo',
        admin_area_1: 'NY',
        postal_code: '14201',
        country_code: 'US',
      },
    },
    payments: { captures: [{
      id: 'CAPTURE-EXACT-1',
      status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '38.16' },
    }] },
  }],
};

const queryText = (first) => Array.isArray(first) ? first.join('?') : String(first || '');
const originalEnv = {
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  FEATURE_PAYPAL: process.env.FEATURE_PAYPAL,
  PAYPAL_ENV: process.env.PAYPAL_ENV,
  PAYPAL_CLIENT_ID_SANDBOX: process.env.PAYPAL_CLIENT_ID_SANDBOX,
  PAYPAL_SECRET_SANDBOX: process.env.PAYPAL_SECRET_SANDBOX,
};

test.before(() => {
  process.env.NETLIFY_DATABASE_URL = 'postgres://paypal-capture-test.invalid/database';
  process.env.FEATURE_PAYPAL = '1';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.PAYPAL_CLIENT_ID_SANDBOX = 'client-id';
  process.env.PAYPAL_SECRET_SANDBOX = 'secret';
});

test.after(() => {
  capture._test.resetNeonFactory();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('capture persists exact provider ID and atomically replaces the provider-selected address', async () => {
  let paidUpdate = null;
  const persisted = {
    ...pending,
    status: 'paid',
    paypal_capture_id: 'CAPTURE-EXACT-1',
    payment_reconciliation_status: 'complete',
    shipping_name: 'Provider Recipient',
    shipping_street: '500 Provider Avenue',
    shipping_street2: null,
    shipping_city: 'Buffalo',
    shipping_state: 'NY',
    shipping_zip: '14201',
  };
  const sql = async (first, ...values) => {
    const query = queryText(first);
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [pending];
    if (/UPDATE orders SET[\s\S]+status = 'paid'/i.test(query)) {
      paidUpdate = { query, values };
      return [persisted];
    }
    return [];
  };
  capture._test.setNeonFactory(() => sql);

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    if (String(url).endsWith(`/v2/checkout/orders/${pending.paypal_order_id}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...capturedOrder, status: 'APPROVED', purchase_units: [{
          ...capturedOrder.purchase_units[0], payments: { captures: [] },
        }] }),
      };
    }
    if (String(url).endsWith(`/v2/checkout/orders/${pending.paypal_order_id}/capture`)) {
      return { ok: true, status: 201, json: async () => capturedOrder };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const response = await capture.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        orderID: pending.paypal_order_id,
        internalOrderId: pending.id,
        checkoutKey,
        customerInfo: { email: 'attacker@example.com' },
        shippingAddress: { street: 'Attacker Street', street2: 'Attacker Suite' },
      }),
    });
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(payload.captureID, 'CAPTURE-EXACT-1');
    assert.equal(payload.customerEmail, 'original-contact@example.com');
    assert.deepEqual(payload.shippingAddress, {
      name: 'Provider Recipient',
      street: '500 Provider Avenue',
      street2: null,
      city: 'Buffalo',
      state: 'NY',
      zip: '14201',
      country: 'US',
    });
    assert.ok(paidUpdate);
    assert.match(paidUpdate.query, /shipping_street2 = CASE WHEN/);
    assert.ok(paidUpdate.values.includes('CAPTURE-EXACT-1'));
    assert.ok(paidUpdate.values.includes('500 Provider Avenue'));
    assert.equal(paidUpdate.values.includes('Attacker Street'), false);
    assert.equal(calls.filter((call) => call.url.endsWith('/capture')).length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('ORDER_ALREADY_CAPTURED with lost recovery remains locked and preserves its promo reservation', async () => {
  const promoPending = {
    ...pending,
    discount_code: 'SAVE20',
    applied_discount_cents: 500,
    applied_discount_type: 'promo',
  };
  const queries = [];
  const sql = async (first) => {
    const query = queryText(first);
    queries.push(query);
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [promoPending];
    if (/WITH locked_target AS MATERIALIZED[\s\S]+UPDATE discount_codes dc[\s\S]+payment_reconciliation_status = 'discount_reserved'/i.test(query)) {
      return [{ id: promoPending.id }];
    }
    return [];
  };
  capture._test.setNeonFactory(() => sql);

  const originalFetch = global.fetch;
  let orderGetCount = 0;
  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'token' }) };
    }
    if (requestUrl.endsWith(`/v2/checkout/orders/${pending.paypal_order_id}`)) {
      orderGetCount += 1;
      if (orderGetCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...capturedOrder,
            status: 'APPROVED',
            purchase_units: [{
              ...capturedOrder.purchase_units[0],
              payments: { captures: [] },
            }],
          }),
        };
      }
      return { ok: false, status: 503, json: async () => ({ name: 'SERVICE_UNAVAILABLE' }) };
    }
    if (requestUrl.endsWith(`/v2/checkout/orders/${pending.paypal_order_id}/capture`)) {
      return {
        ok: false,
        status: 422,
        json: async () => ({
          name: 'UNPROCESSABLE_ENTITY',
          details: [{
            issue: 'ORDER_ALREADY_CAPTURED',
            description: 'The order has already been captured.',
          }],
        }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const response = await capture.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        orderID: pending.paypal_order_id,
        internalOrderId: pending.id,
        checkoutKey,
      }),
    });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 202, response.body);
    assert.equal(payload.paymentCaptured, false);
    assert.equal(payload.paymentStatusUnknown, true);
    assert.equal(payload.reconciliationRequired, true);
    assert.equal(payload.doNotRetry, true);
    assert.notEqual(payload.restartPayment, true);
    assert.equal(orderGetCount, 2);
    assert.equal(
      queries.some((query) => /UPDATE discount_codes[\s\S]+SET used = FALSE/i.test(query)),
      false,
      'an ambiguous provider result must not release the stored-code reservation',
    );
    assert.equal(
      queries.some((query) => /payment_reconciliation_status = 'payment_failed'/i.test(query)),
      false,
      'an ambiguous provider result must not mark the order retryable',
    );
    assert.equal(capture._test.isDefinitiveFailure({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, 422), false);
    assert.equal(capture._test.isDefinitiveFailure({ details: [{ issue: 'INSTRUMENT_DECLINED' }] }, 422), true);
  } finally {
    global.fetch = originalFetch;
  }
});
