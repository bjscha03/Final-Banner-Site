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

function database({ linked = true, itemRow = item, orderRow = order } = {}) {
  const state = { linkWrites: 0 };
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT[\s\S]+FROM orders[\s\S]+WHERE id/i.test(query)) return [orderRow];
    if (/SELECT[\s\S]+FROM order_items/i.test(query)) return [itemRow];
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
