import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const capture = require('../_shared/legacy/paypal-capture-final.cjs');
const captureForward = require('../_shared/legacy/paypal-capture-forward.cjs');
const customerInfo = require('../_shared/legacy/paypal-customer-info.cjs');
const captureWrapper = await import('../paypal-capture-minimal.mjs');
const paymentStatus = await import('../paypal-payment-status.mjs');

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
    payment_reconciliation_status: 'captured_bookkeeping_pending',
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
    if (/SET payment_reconciliation_status = \?/i.test(query)
        && /status = ANY\(\?::text\[\]\)/i.test(query)
        && !/AND payment_reconciliation_status = \?/i.test(query)) {
      return [{ id: persisted.id }];
    }
    if (/SET payment_reconciliation_status = 'complete'/i.test(query)
        && /AND payment_reconciliation_status = \?/i.test(query)) {
      return [{ id: persisted.id }];
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
    assert.match(paidUpdate.query, /payment_reconciliation_status = \?/);
    assert.ok(paidUpdate.values.includes('captured_bookkeeping_pending'));
    assert.match(paidUpdate.query, /shipping_street2 = CASE WHEN/);
    assert.ok(paidUpdate.values.includes('CAPTURE-EXACT-1'));
    assert.ok(paidUpdate.values.includes('500 Provider Avenue'));
    assert.equal(paidUpdate.values.includes('Attacker Street'), false);
    assert.equal(calls.filter((call) => call.url.endsWith('/capture')).length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('captured PayPal bookkeeping remains durably retryable until discount completion succeeds', async () => {
  const order = {
    ...pending,
    status: 'paid',
    paypal_capture_id: 'CAPTURE-BOOKKEEPING-1',
    payment_reconciliation_status: 'captured_bookkeeping_pending',
    discount_code: 'SAVE20',
    applied_discount_cents: 500,
    applied_discount_type: 'promo',
  };
  let discountReady = false;
  let reconciliationState = order.payment_reconciliation_status;
  const queries = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    queries.push({ query, values });
    if (/UPDATE orders[\s\S]+SET payment_reconciliation_status = \?/i.test(query)
        && /status = ANY\(\?::text\[\]\)/i.test(query)
        && !/AND payment_reconciliation_status = \?/i.test(query)) {
      reconciliationState = values[0];
      return [{ id: order.id }];
    }
    if (/UPDATE discount_codes/i.test(query)) {
      return discountReady ? [{ code: order.discount_code }] : [];
    }
    if (/FROM trade_show_promo_codes/i.test(query)) return [];
    if (/UPDATE orders[\s\S]+SET payment_reconciliation_status = 'complete'/i.test(query)) {
      reconciliationState = 'complete';
      return [{ id: order.id }];
    }
    return [];
  };

  const incomplete = await capture._test.completeCapturedBookkeeping(sql, order);
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.code, 'DISCOUNT_COMPLETION_CONFLICT');
  assert.equal(reconciliationState, 'captured_bookkeeping_pending');
  assert.equal(queries.some(({ query }) => /SET payment_reconciliation_status = 'complete'/i.test(query)), false);

  discountReady = true;
  const completed = await capture._test.completeCapturedBookkeeping(sql, {
    ...order,
    payment_reconciliation_status: reconciliationState,
  });
  assert.deepEqual(completed, { ok: true });
  assert.equal(reconciliationState, 'complete');
});

test('completed captured bookkeeping is idempotent and is never reopened by a later retry', async () => {
  const order = {
    ...pending,
    status: 'paid',
    paypal_capture_id: 'CAPTURE-BOOKKEEPING-COMPLETE',
    payment_reconciliation_status: 'complete',
  };
  let discountWrites = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SET payment_reconciliation_status = \?/i.test(query)) return [];
    if (/SELECT payment_reconciliation_status/i.test(query)) {
      return [{ payment_reconciliation_status: 'complete' }];
    }
    if (/UPDATE discount_codes/i.test(query)) discountWrites += 1;
    return [];
  };

  const result = await capture._test.completeCapturedBookkeeping(sql, order);
  assert.deepEqual(result, { ok: true, alreadyComplete: true });
  assert.equal(discountWrites, 0);
  assert.match(capture._test.completeCapturedBookkeeping.toString(), /IS DISTINCT FROM 'complete'/);
});

test('an already-complete captured handler retry performs no bookkeeping update or provider call', async () => {
  const order = {
    ...pending,
    status: 'paid',
    paypal_capture_id: 'CAPTURE-ALREADY-COMPLETE',
    payment_reconciliation_status: 'complete',
  };
  const queries = [];
  capture._test.setNeonFactory(() => async (first) => {
    const query = queryText(first);
    queries.push(query);
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [order];
    return [];
  });
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => { providerCalls += 1; throw new Error('provider call not expected'); };
  try {
    const response = await capture.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        orderID: order.paypal_order_id,
        internalOrderId: order.id,
        checkoutKey,
      }),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(providerCalls, 0);
    assert.equal(queries.some((query) => /^\s*UPDATE\s+/i.test(query)), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a lost final bookkeeping CAS treats an exact concurrent complete readback as success', async () => {
  const order = {
    ...pending,
    status: 'paid',
    paypal_capture_id: 'CAPTURE-CONCURRENT-COMPLETE',
    payment_reconciliation_status: 'captured_bookkeeping_pending',
  };
  let finalCasAttempts = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SET payment_reconciliation_status = \?/i.test(query)) return [{ id: order.id }];
    if (/SET payment_reconciliation_status = 'complete'/i.test(query)) {
      finalCasAttempts += 1;
      return [];
    }
    if (/SELECT payment_reconciliation_status/i.test(query)) {
      return [{ payment_reconciliation_status: 'complete' }];
    }
    return [];
  };

  const result = await capture._test.completeCapturedBookkeeping(sql, order);
  assert.deepEqual(result, { ok: true, alreadyComplete: true });
  assert.equal(finalCasAttempts, 1);
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

const retiredAttemptCases = [
  {
    name: 'a provider order already containing a declined capture',
    reconcileOnly: false,
    getOrders: [{
      ...capturedOrder,
      status: 'COMPLETED',
      purchase_units: [{
        ...capturedOrder.purchase_units[0],
        payments: { captures: [{
          id: 'CAPTURE-DECLINED-PREEXISTING',
          status: 'DECLINED',
          status_details: { reason: 'INSTRUMENT_DECLINED' },
        }] },
      }],
    }],
    captureResponse: null,
    expectedCode: 'INSTRUMENT_DECLINED',
    expectedCaptureId: 'CAPTURE-DECLINED-PREEXISTING',
  },
  {
    name: 'a definitively expired provider order during reconciliation',
    reconcileOnly: true,
    getOrders: [{
      ...capturedOrder,
      status: 'EXPIRED',
      purchase_units: [{
        ...capturedOrder.purchase_units[0],
        payments: { captures: [] },
      }],
    }],
    captureResponse: null,
    expectedCode: 'PAYPAL_ORDER_EXPIRED',
    expectedCaptureId: null,
  },
  {
    name: 'a definitive decline returned by the capture request',
    reconcileOnly: false,
    getOrders: [
      {
        ...capturedOrder,
        status: 'APPROVED',
        purchase_units: [{
          ...capturedOrder.purchase_units[0],
          payments: { captures: [] },
        }],
      },
      {
        ...capturedOrder,
        status: 'APPROVED',
        purchase_units: [{
          ...capturedOrder.purchase_units[0],
          payments: { captures: [] },
        }],
      },
    ],
    captureResponse: {
      ok: false,
      status: 422,
      body: {
        name: 'UNPROCESSABLE_ENTITY',
        details: [{ issue: 'INSTRUMENT_DECLINED' }],
      },
    },
    expectedCode: 'INSTRUMENT_DECLINED',
    expectedCaptureId: null,
  },
];

for (const scenario of retiredAttemptCases) {
  test(`${scenario.name} records one retry-generation marker before returning 422`, async () => {
    const ledgerAttempts = [];
    const sql = async (first, ...values) => {
      const query = queryText(first);
      if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [pending];
      if (/INSERT INTO paypal_payment_attempts/i.test(query)) {
        ledgerAttempts.push({
          internalOrderId: values[0],
          paypalOrderId: values[2],
          captureId: values[3],
          requestId: values[5],
          source: values[6],
          processingStatus: values[15],
          errorCode: values[17],
        });
      }
      if (/SELECT 1 AS persisted[\s\S]+FROM paypal_payment_attempts/i.test(query)) {
        return ledgerAttempts.length ? [{ persisted: 1 }] : [];
      }
      return [];
    };
    capture._test.setNeonFactory(() => sql);

    const originalFetch = global.fetch;
    let orderGetCount = 0;
    let captureCalls = 0;
    global.fetch = async (url) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith('/v1/oauth2/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'token' }) };
      }
      if (requestUrl.endsWith(`/v2/checkout/orders/${pending.paypal_order_id}`)) {
        const providerOrder = scenario.getOrders[orderGetCount];
        orderGetCount += 1;
        return { ok: true, status: 200, json: async () => providerOrder };
      }
      if (requestUrl.endsWith(`/v2/checkout/orders/${pending.paypal_order_id}/capture`)) {
        captureCalls += 1;
        return {
          ok: scenario.captureResponse.ok,
          status: scenario.captureResponse.status,
          json: async () => scenario.captureResponse.body,
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
          reconcileOnly: scenario.reconcileOnly,
        }),
      });
      const payload = JSON.parse(response.body);
      assert.equal(response.statusCode, 422, response.body);
      assert.equal(payload.paymentCaptured, false);
      assert.equal(payload.paymentStatusUnknown, false);
      assert.equal(payload.reconciliationRequired, false);
      assert.equal(payload.providerCode, scenario.expectedCode);
      assert.deepEqual(ledgerAttempts, [{
        internalOrderId: pending.id,
        paypalOrderId: pending.paypal_order_id,
        captureId: scenario.expectedCaptureId,
        requestId: `capture-${pending.paypal_order_id}`,
        source: 'capture',
        processingStatus: 'declined',
        errorCode: scenario.expectedCode,
      }]);
      assert.equal(captureCalls, scenario.captureResponse ? 1 : 0);
      assert.equal(orderGetCount, scenario.getOrders.length);
    } finally {
      global.fetch = originalFetch;
    }
  });
}

test('a decline-marker persistence failure remains bound and reconciliation-locked', async () => {
  const queries = [];
  const sql = async (first) => {
    const query = queryText(first);
    queries.push(query);
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [pending];
    if (/INSERT INTO paypal_payment_attempts/i.test(query)) {
      throw new Error('simulated durable-ledger failure');
    }
    return [];
  };
  capture._test.setNeonFactory(() => sql);

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'token' }) };
    }
    if (requestUrl.endsWith(`/v2/checkout/orders/${pending.paypal_order_id}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...capturedOrder,
          status: 'COMPLETED',
          purchase_units: [{
            ...capturedOrder.purchase_units[0],
            payments: { captures: [{
              id: 'CAPTURE-DECLINED-LEDGER-FAILURE',
              status: 'DECLINED',
              status_details: { reason: 'INSTRUMENT_DECLINED' },
            }] },
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
    assert.equal(payload.paymentStatusUnknown, true);
    assert.equal(payload.reconciliationRequired, true);
    assert.equal(payload.doNotRetry, true);
    assert.notEqual(payload.retryAllowed, true);
    assert.notEqual(payload.restartPayment, true);
    assert.equal(
      queries.some((query) => /payment_reconciliation_status = 'payment_failed'/i.test(query)),
      false,
      'the provider binding must not be released when its durable decline marker failed',
    );
    assert.equal(
      queries.some((query) => /paypal_order_id\s*=\s*NULL/i.test(query)),
      false,
      'the authoritative capture core never clears a provider binding',
    );
    assert.equal(
      queries.some((query) => /payment_reconciliation_status = CASE/i.test(query)),
      true,
      'the order should be reconciliation-locked after the marker failure',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('conditional retirement requires the durable decline marker before clearing the binding', async () => {
  const state = { markerPersisted: false, paypalOrderId: pending.paypal_order_id };
  const sql = async (first) => {
    const query = queryText(first);
    if (/UPDATE orders[\s\S]+paypal_order_id = NULL/i.test(query)) {
      assert.match(query, /EXISTS[\s\S]+FROM paypal_payment_attempts[\s\S]+processing_status = 'declined'/i);
      if (!state.markerPersisted || state.paypalOrderId !== pending.paypal_order_id) return [];
      state.paypalOrderId = null;
      return [{ id: pending.id }];
    }
    if (/SELECT 1 AS retired[\s\S]+FROM orders/i.test(query)) {
      assert.match(query, /paypal_order_id IS NULL/i);
      assert.match(query, /EXISTS[\s\S]+FROM paypal_payment_attempts[\s\S]+processing_status = 'declined'/i);
      return state.markerPersisted && state.paypalOrderId === null ? [{ retired: 1 }] : [];
    }
    throw new Error(`unexpected retirement query: ${query}`);
  };
  customerInfo._test.setNeonFactory(() => sql);
  try {
    const withoutMarker = await customerInfo.retireDefinitivelyDeclinedPayPalOrder({
      internalOrderId: pending.id,
      orderID: pending.paypal_order_id,
    });
    assert.equal(withoutMarker, false);
    assert.equal(state.paypalOrderId, pending.paypal_order_id);

    state.markerPersisted = true;
    const retired = await customerInfo.retireDefinitivelyDeclinedPayPalOrder({
      internalOrderId: pending.id,
      orderID: pending.paypal_order_id,
    });
    assert.equal(retired, true);
    assert.equal(state.paypalOrderId, null);

    const duplicate = await customerInfo.retireDefinitivelyDeclinedPayPalOrder({
      internalOrderId: pending.id,
      orderID: pending.paypal_order_id,
    });
    assert.equal(duplicate, true, 'the same durable retirement must be idempotent');

    state.paypalOrderId = pending.paypal_order_id;
    const concurrent = await Promise.all([
      customerInfo.retireDefinitivelyDeclinedPayPalOrder({
        internalOrderId: pending.id,
        orderID: pending.paypal_order_id,
      }),
      customerInfo.retireDefinitivelyDeclinedPayPalOrder({
        internalOrderId: pending.id,
        orderID: pending.paypal_order_id,
      }),
    ]);
    assert.deepEqual(concurrent, [true, true]);
    assert.equal(state.paypalOrderId, null);

    state.markerPersisted = false;
    const clearedWithoutMarker = await customerInfo.retireDefinitivelyDeclinedPayPalOrder({
      internalOrderId: pending.id,
      orderID: pending.paypal_order_id,
    });
    assert.equal(clearedWithoutMarker, false, 'NULL without the exact marker is never retryable');
  } finally {
    customerInfo._test.resetNeonFactory();
  }
});

test('concurrent duplicate decline wrappers both observe one durable idempotent retirement', async () => {
  const state = { paypalOrderId: pending.paypal_order_id };
  const sql = async (first) => {
    const query = queryText(first);
    if (/UPDATE orders[\s\S]+paypal_order_id = NULL/i.test(query)) {
      if (state.paypalOrderId !== pending.paypal_order_id) return [];
      state.paypalOrderId = null;
      return [{ id: pending.id }];
    }
    if (/SELECT 1 AS retired[\s\S]+FROM orders/i.test(query)) {
      return state.paypalOrderId === null ? [{ retired: 1 }] : [];
    }
    throw new Error(`unexpected duplicate-retirement query: ${query}`);
  };
  const originalCaptureHandler = captureForward.handler;
  customerInfo._test.setNeonFactory(() => sql);
  captureForward.handler = async () => ({
    statusCode: 422,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: false,
      success: false,
      paymentCaptured: false,
      paymentStatusUnknown: false,
      reconciliationRequired: false,
      doNotRetry: false,
      orderID: pending.paypal_order_id,
      internalOrderId: pending.id,
      providerCode: 'INSTRUMENT_DECLINED',
    }),
  });

  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      orderID: pending.paypal_order_id,
      internalOrderId: pending.id,
      checkoutKey,
    }),
  };
  try {
    const responses = await Promise.all([
      captureWrapper._test.handler(event, {}),
      captureWrapper._test.handler(event, {}),
    ]);
    for (const response of responses) {
      const payload = JSON.parse(response.body);
      assert.equal(response.statusCode, 422, response.body);
      assert.equal(payload.retryAllowed, true);
      assert.equal(payload.doNotRetry, false);
      assert.equal(payload.reconciliationRequired, false);
      assert.equal(payload.paymentStatusUnknown, false);
    }
    assert.equal(state.paypalOrderId, null);
  } finally {
    captureForward.handler = originalCaptureHandler;
    customerInfo._test.resetNeonFactory();
  }
});

for (const retirement of [
  { name: 'returns false', behavior: async () => false },
  { name: 'throws', behavior: async () => { throw new Error('simulated conditional-clear failure'); } },
]) {
  test(`the deployed decline wrapper stays locked when conditional retirement ${retirement.name}`, async () => {
    const originalCaptureHandler = captureForward.handler;
    const originalRetire = customerInfo.retireDefinitivelyDeclinedPayPalOrder;
    const originalLock = customerInfo.lockPayPalOrderForReconciliation;
    let reconciliationLocks = 0;
    captureForward.handler = async () => ({
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        success: false,
        paymentCaptured: false,
        paymentStatusUnknown: false,
        reconciliationRequired: false,
        doNotRetry: false,
        restartPayment: true,
        orderID: pending.paypal_order_id,
        internalOrderId: pending.id,
        providerCode: 'INSTRUMENT_DECLINED',
      }),
    });
    customerInfo.retireDefinitivelyDeclinedPayPalOrder = retirement.behavior;
    customerInfo.lockPayPalOrderForReconciliation = async () => {
      reconciliationLocks += 1;
      return true;
    };

    try {
      const response = await captureWrapper._test.handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          orderID: pending.paypal_order_id,
          internalOrderId: pending.id,
          checkoutKey,
        }),
      }, {});
      const payload = JSON.parse(response.body);
      assert.equal(response.statusCode, 202, response.body);
      assert.equal(payload.paymentStatusUnknown, true);
      assert.equal(payload.reconciliationRequired, true);
      assert.equal(payload.doNotRetry, true);
      assert.equal(payload.safeToRetry, false);
      assert.equal(payload.restartPayment, false);
      assert.equal(payload.retryAllowed, false);
      assert.equal(payload.error, 'PAYPAL_DECLINE_RETIREMENT_INCOMPLETE');
      assert.equal(reconciliationLocks, 1);
    } finally {
      captureForward.handler = originalCaptureHandler;
      customerInfo.retireDefinitivelyDeclinedPayPalOrder = originalRetire;
      customerInfo.lockPayPalOrderForReconciliation = originalLock;
    }
  });
}

test('status reconciliation also stays locked when conditional retirement fails', async () => {
  const originalCaptureHandler = captureForward.handler;
  const originalRetire = customerInfo.retireDefinitivelyDeclinedPayPalOrder;
  const originalLock = customerInfo.lockPayPalOrderForReconciliation;
  let reconciliationLocks = 0;
  captureForward.handler = async () => ({
    statusCode: 422,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: false,
      paymentCaptured: false,
      paymentStatusUnknown: false,
      reconciliationRequired: false,
      providerCode: 'INSTRUMENT_DECLINED',
    }),
  });
  customerInfo.retireDefinitivelyDeclinedPayPalOrder = async () => false;
  customerInfo.lockPayPalOrderForReconciliation = async () => {
    reconciliationLocks += 1;
    return true;
  };
  paymentStatus._test.setNeonFactory(() => async (first) => (
    /SELECT[\s\S]+FROM orders/i.test(queryText(first)) ? [pending] : []
  ));

  try {
    const response = await paymentStatus._test.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: pending.id, checkoutKey }),
    });
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(payload.paymentStatusUnknown, true);
    assert.equal(payload.reconciliationRequired, true);
    assert.equal(payload.doNotRetry, true);
    assert.equal(payload.safeToRetry, false);
    assert.equal(payload.retryAllowed, false);
    assert.equal(payload.error, 'PAYPAL_DECLINE_RETIREMENT_INCOMPLETE');
    assert.equal(reconciliationLocks, 1);
  } finally {
    paymentStatus._test.resetNeonFactory();
    captureForward.handler = originalCaptureHandler;
    customerInfo.retireDefinitivelyDeclinedPayPalOrder = originalRetire;
    customerInfo.lockPayPalOrderForReconciliation = originalLock;
  }
});
