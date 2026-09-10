import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createModule = require('../_shared/legacy/paypal-create-order-forward.cjs');

const checkoutKey = '12345678-1234-4234-9234-123456789abc';
const order = {
  id: '5e532adb-ec9d-4b76-9892-87d190f9fa63',
  status: 'pending',
  subtotal_cents: 3600,
  tax_cents: 216,
  total_cents: 3816,
  currency: 'usd',
  applied_discount_cents: 0,
  same_day_fee_cents: 0,
  saturday_fee_cents: 0,
  shipping_cents: 0,
  paypal_order_id: null,
  paypal_capture_id: null,
  stripe_payment_intent_id: null,
  payment_method: 'paypal',
  payment_reconciliation_status: 'awaiting_capture',
  checkout_idempotency_key: checkoutKey,
  email: 'contact@example.com',
  customer_name: 'Contact Person',
  shipping_name: 'Delivery Recipient',
  shipping_street: '123 Main Street',
  shipping_street2: 'Suite 4',
  shipping_city: 'Buffalo',
  shipping_state: 'NY',
  shipping_zip: '14201',
  shipping_country: 'US',
};
const item = {
  id: 'line-1',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  rounded_corners: null,
  rope_feet: 0,
  rope_placement: null,
  pole_pockets: 'none',
  pole_pocket_position: 'none',
  pole_pocket_size: null,
  line_total_cents: 3600,
  design_service_enabled: false,
  yard_sign_sidedness: null,
  yard_sign_step_stakes_enabled: false,
  yard_sign_step_stakes_qty: 0,
  yard_sign_design_count: 0,
  yard_sign_designs: null,
};

const queryText = (first) => Array.isArray(first) ? first.join('?') : String(first || '');

function database({
  linked = true,
  itemRow = item,
  orderRow = order,
  definitivelyDeclinedAttempts = 0,
} = {}) {
  const state = { linkWrites: 0 };
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [orderRow];
    if (/SELECT[\s\S]+FROM order_items/i.test(query)) return [itemRow];
    if (/SELECT COUNT\(DISTINCT COALESCE\(paypal_order_id, request_id\)\)[\s\S]+FROM paypal_payment_attempts/i.test(query)) {
      return [{ declined_attempt_count: definitivelyDeclinedAttempts }];
    }
    if (/UPDATE orders[\s\S]+SET paypal_order_id/i.test(query)) {
      state.linkWrites += 1;
      return linked ? [{ paypal_order_id: 'PAYPAL-ORDER-1' }] : [];
    }
    return [];
  };
  return { factory: () => sql, state };
}

const originalEnv = {
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  FEATURE_PAYPAL: process.env.FEATURE_PAYPAL,
  PAYPAL_ENV: process.env.PAYPAL_ENV,
  PAYPAL_CLIENT_ID_SANDBOX: process.env.PAYPAL_CLIENT_ID_SANDBOX,
  PAYPAL_SECRET_SANDBOX: process.env.PAYPAL_SECRET_SANDBOX,
  FEATURE_MIN_ORDER_FLOOR: process.env.FEATURE_MIN_ORDER_FLOOR,
  MIN_ORDER_CENTS: process.env.MIN_ORDER_CENTS,
};

test.before(() => {
  process.env.NETLIFY_DATABASE_URL = 'postgres://paypal-create-test.invalid/database';
  process.env.FEATURE_PAYPAL = '1';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.PAYPAL_CLIENT_ID_SANDBOX = 'client-id';
  process.env.PAYPAL_SECRET_SANDBOX = 'secret';
  process.env.FEATURE_MIN_ORDER_FLOOR = '1';
  process.env.MIN_ORDER_CENTS = '2000';
});

test.after(() => {
  createModule._test.resetNeonFactory();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('authoritative create sends exact invoice, identity, and persisted shipping before linking', async () => {
  const db = database();
  createModule._test.setNeonFactory(db.factory);
  const originalFetch = global.fetch;
  let outbound = null;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    outbound = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      json: async () => ({ ...outbound, id: 'PAYPAL-ORDER-1', status: 'CREATED' }),
    };
  };
  try {
    const response = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(JSON.parse(response.body).paypalOrderId, 'PAYPAL-ORDER-1');
    assert.equal(db.state.linkWrites, 1);
    const unit = outbound.purchase_units[0];
    assert.equal(unit.custom_id, order.id);
    assert.equal(unit.invoice_id, `BOTF-${order.id}`);
    assert.equal(unit.items[0].quantity, '1');
    assert.equal(unit.items[0].unit_amount.value, '36.00');
    assert.deepEqual(unit.amount.breakdown, {
      item_total: { currency_code: 'USD', value: '36.00' },
      shipping: { currency_code: 'USD', value: '0.00' },
      tax_total: { currency_code: 'USD', value: '2.16' },
    });
    assert.equal(unit.amount.value, '38.16');
    assert.equal(unit.shipping.name.full_name, 'Delivery Recipient');
    assert.equal(unit.shipping.address.address_line_2, 'Suite 4');
  } finally {
    global.fetch = originalFetch;
  }
});

test('PayPal echo identity mismatch fails closed and never links the provider order', async () => {
  const db = database();
  createModule._test.setNeonFactory(db.factory);
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    const outbound = JSON.parse(options.body);
    outbound.purchase_units[0].custom_id = 'different-order';
    return {
      ok: true,
      status: 201,
      json: async () => ({ ...outbound, id: 'PAYPAL-ORDER-BAD', status: 'CREATED' }),
    };
  };
  try {
    const response = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    assert.equal(response.statusCode, 502, response.body);
    assert.equal(JSON.parse(response.body).error, 'PAYPAL_ORDER_IDENTITY_MISMATCH');
    assert.equal(db.state.linkWrites, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('bad checkout credential is rejected before OAuth or provider creation', async () => {
  const db = database();
  createModule._test.setNeonFactory(db.factory);
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error('provider should not be called');
  };
  try {
    const response = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey: 'wrong', totalCents: 3816 }),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(calls, 0);
    assert.equal(db.state.linkWrites, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a reconciliation-locked bound order cannot reuse an APPROVED provider order', async () => {
  const lockedOrder = {
    ...order,
    paypal_order_id: 'PAYPAL-ORDER-LOCKED',
    payment_reconciliation_status: 'required',
  };
  const db = database({ orderRow: lockedOrder });
  createModule._test.setNeonFactory(db.factory);
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: lockedOrder.paypal_order_id, status: 'APPROVED' }),
    };
  };
  try {
    const response = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(payload.paymentStatusUnknown, true);
    assert.equal(payload.reconciliationRequired, true);
    assert.equal(payload.doNotRetry, true);
    assert.equal(payload.safeToRetry, false);
    assert.equal(payload.retryAllowed, false);
    assert.equal(payload.paypalOrderId, lockedOrder.paypal_order_id);
    assert.equal(providerCalls, 0, 'the locked order must stop before OAuth, provider GET, or create');
    assert.equal(db.state.linkWrites, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('persisted browser-authored amount or invalid option is rejected before PayPal', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error('provider should not be called');
  };
  try {
    for (const itemRow of [
      { ...item, line_total_cents: 1 },
      { ...item, material: 'free-vinyl' },
    ]) {
      const db = database({ itemRow });
      createModule._test.setNeonFactory(db.factory);
      const response = await createModule.handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
      });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(db.state.linkWrites, 0);
    }
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a definitive decline advances PayPal create idempotency while duplicate retry creates reuse it', async () => {
  const db = database({
    definitivelyDeclinedAttempts: 1,
    linked: false,
  });
  createModule._test.setNeonFactory(db.factory);
  const originalFetch = global.fetch;
  const requestIds = [];
  let retryOrder = null;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    requestIds.push(options.headers['PayPal-Request-Id']);
    const outbound = JSON.parse(options.body);
    retryOrder ||= { ...outbound, id: 'PAYPAL-ORDER-RETRY-1', status: 'CREATED' };
    return { ok: true, status: 201, json: async () => retryOrder };
  };
  try {
    const responses = await Promise.all([0, 1].map(() => createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    })));
    for (const response of responses) {
      // This fixture deliberately withholds the conditional link so both calls
      // reach PayPal and prove that one retry attempt has one stable request ID.
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(JSON.parse(response.body).error, 'PAYPAL_ORDER_LINK_CONFLICT');
    }
    assert.deepEqual(requestIds, [
      `create-${order.id}-retry-1`,
      `create-${order.id}-retry-1`,
    ]);
    assert.notEqual(requestIds[0], `create-${order.id}`);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a lost first-create response preserves the historical request ID and recovers idempotently', async () => {
  const db = database();
  createModule._test.setNeonFactory(db.factory);
  const originalFetch = global.fetch;
  const requestIds = [];
  let providerCalls = 0;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    providerCalls += 1;
    requestIds.push(options.headers['PayPal-Request-Id']);
    if (providerCalls === 1) throw new Error('simulated response lost after provider accepted request');
    const outbound = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      json: async () => ({ ...outbound, id: 'PAYPAL-ORDER-1', status: 'CREATED' }),
    };
  };
  try {
    const first = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    assert.equal(first.statusCode, 500, first.body);

    const recovered = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.equal(JSON.parse(recovered.body).paypalOrderId, 'PAYPAL-ORDER-1');
    assert.deepEqual(requestIds, [
      `create-${order.id}`,
      `create-${order.id}`,
    ]);
    assert.equal(db.state.linkWrites, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a delayed create response cannot relink a provider order retired by a concurrent decline', async () => {
  const providerOrderId = 'PAYPAL-ORDER-DECLINED-DURING-CREATE';
  const state = {
    order: { ...order, paypal_order_id: null },
    declinedProviderIds: new Set(),
    linkWrites: 0,
    staleLinkBlocked: false,
  };
  const sql = async (first) => {
    const query = queryText(first);
    if (/^\s*SELECT COUNT\(DISTINCT COALESCE\(paypal_order_id, request_id\)\)/i.test(query)) {
      return [{ declined_attempt_count: state.declinedProviderIds.size }];
    }
    if (/SELECT[\s\S]+FROM order_items/i.test(query)) return [item];
    if (/UPDATE orders[\s\S]+SET paypal_order_id/i.test(query)) {
      const hasGenerationGuard = /COUNT\(DISTINCT COALESCE\(attempt\.paypal_order_id, attempt\.request_id\)\)[\s\S]+processing_status = 'declined'/i.test(query);
      const hasProviderGuard = /NOT EXISTS[\s\S]+declined\.paypal_order_id[\s\S]+declined\.processing_status = 'declined'/i.test(query);
      if (state.declinedProviderIds.has(providerOrderId) && hasGenerationGuard && hasProviderGuard) {
        state.staleLinkBlocked = true;
        return [];
      }
      state.order.paypal_order_id = providerOrderId;
      state.linkWrites += 1;
      return [{ paypal_order_id: providerOrderId }];
    }
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [{ ...state.order }];
    return [];
  };
  createModule._test.setNeonFactory(() => sql);

  const originalFetch = global.fetch;
  const requestIds = [];
  let providerCreateCalls = 0;
  let announceDelayedCreate;
  const delayedCreateStarted = new Promise((resolve) => { announceDelayedCreate = resolve; });
  let releaseDelayedCreate;
  const delayedCreateResponse = new Promise((resolve) => { releaseDelayedCreate = resolve; });
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    providerCreateCalls += 1;
    requestIds.push(options.headers['PayPal-Request-Id']);
    const outbound = JSON.parse(options.body);
    const providerResponse = {
      ok: true,
      status: 201,
      json: async () => ({ ...outbound, id: providerOrderId, status: 'CREATED' }),
    };
    if (providerCreateCalls === 1) {
      announceDelayedCreate();
      await delayedCreateResponse;
    }
    return providerResponse;
  };

  try {
    const delayed = createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    await delayedCreateStarted;

    const fast = await createModule.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ internalOrderId: order.id, checkoutKey, totalCents: 3816 }),
    });
    assert.equal(fast.statusCode, 200, fast.body);
    assert.equal(state.order.paypal_order_id, providerOrderId);

    // Interleave the durable marker and successful conditional retirement
    // before the first provider response reaches its final link CAS.
    state.declinedProviderIds.add(providerOrderId);
    state.order.paypal_order_id = null;
    releaseDelayedCreate();

    const stale = await delayed;
    const stalePayload = JSON.parse(stale.body);
    assert.equal(stale.statusCode, 409, stale.body);
    assert.equal(stalePayload.error, 'PAYPAL_CREATE_ATTEMPT_RETIRED');
    assert.equal(stalePayload.retryAllowed, true);
    assert.equal(state.staleLinkBlocked, true);
    assert.equal(state.linkWrites, 1);
    assert.equal(state.order.paypal_order_id, null);
    assert.deepEqual(requestIds, [
      `create-${order.id}`,
      `create-${order.id}`,
    ]);
  } finally {
    releaseDelayedCreate();
    global.fetch = originalFetch;
  }
});
