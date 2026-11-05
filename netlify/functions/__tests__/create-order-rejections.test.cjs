'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Execute the real order handler with isolated database/provider boundaries.
// These rejection branches must return before any order or charge is written.
function fixture(validateDiscountForCheckout = async () => ({ valid: true, discount: null })) {
  const filename = require.resolve('../_shared/legacy/create-order-core.cjs');
  const realRequire = createRequire(filename);
  const queries = [];
  const errors = [];
  const sql = async (strings) => {
    const query = strings.join('?');
    queries.push(query);
    if (/^\s*(ALTER|CREATE)\b/.test(query) || /SELECT id, email FROM profiles/.test(query)) return [];
    throw new Error('Unexpected database operation in rejection test');
  };
  sql.transaction = () => { throw new Error('Rejected checkout must not persist an order'); };
  const module = { exports: {} };
  const scopedRequire = name => {
    if (name === '@neondatabase/serverless') return { neon: () => sql };
    if (name === '../discount-validation.cjs') return { validateDiscountForCheckout };
    return realRequire(name);
  };
  vm.runInNewContext(`(function(require,module,exports,process,console){${fs.readFileSync(filename, 'utf8')}\n})`, {
    Buffer, URL, setTimeout, clearTimeout,
    fetch: () => { throw new Error('Rejected checkout must not invoke an external service'); },
  }, { filename })(scopedRequire, module, module.exports,
    { env: { DATABASE_URL: 'postgresql://isolated.invalid/test' } },
    { log() {}, info() {}, warn() {}, error(...args) { errors.push(args); } });
  const item = { product_type: 'banner', width_in: 24, height_in: 63, quantity: 1,
    material: '13oz', line_total_cents: 7150, file_key: 'isolated-test-artwork' };
  return {
    core: module.exports, item, queries, errors,
    async request(overrides = {}) {
      return module.exports.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({
        email: 'returning@example.com', payment_method: 'legacy', payment_status: 'pending',
        items: [item], ...overrides,
      }) }, {});
    },
  };
}

function assertRejection(response, status, code, fixture) {
  assert.equal(response.statusCode, status, response.body);
  assert.equal(JSON.parse(response.body).code, code);
  assert.equal(response.headers['Content-Type'], 'application/json');
  assert.equal(fixture.errors.some(args => args.some(arg => String(arg).includes('ReferenceError'))), false);
  assert.equal(fixture.queries.some(query => /\b(?:INSERT|UPDATE|DELETE)\b/.test(query)), false);
}

test('returning-customer discount rejection remains a useful 400, not a server crash', async () => {
  const f = fixture(async () => ({ valid: false, error: 'The first-order offer is not available for this customer.' }));
  const response = await f.request({ discountCode: { code: 'NEW20' } });
  assertRejection(response, 400, 'DISCOUNT_CODE_INVALID', f);
  assert.match(JSON.parse(response.body).error, /first-order offer/);
});

test('recovery offer identity rejection remains a 400 before any order is written', async () => {
  let calls = 0;
  const f = fixture(async () => ++calls === 1
    ? { valid: true, discount: { code: 'RECOVERY25', discountPercentage: 25, recoveryOffer: true } }
    : { valid: false, error: 'This recovery offer belongs to a different cart.' });
  const response = await f.request({ discountCode: { code: 'RECOVERY25' } });
  assertRejection(response, 400, 'DISCOUNT_CODE_INVALID', f);
  assert.equal(calls, 2);
});

test('retired campaigns return 410 instead of throwing while constructing the rejection', async () => {
  const f = fixture();
  assertRejection(await f.request({ items: [{ ...f.item, product_type: 'design_deposit' }] }), 410, 'RETIRED_CAMPAIGN_ITEM', f);
});

test('legacy yard-sign quantity rejection returns 400 instead of a server crash', async () => {
  const f = fixture();
  assertRejection(await f.request({ items: [{ ...f.item, product_type: 'yard_sign', quantity: 1 }] }), 400, 'YARD_SIGN_QUANTITY_INVALID', f);
});

test('Stripe propagates the real discount rejection without creating a PaymentIntent', async () => {
  const f = fixture(async () => ({ valid: false, error: 'The first-order offer is not available for this customer.' }));
  const filename = require.resolve('../_shared/stripe-checkout-service.cjs');
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports,process,console){${fs.readFileSync(filename, 'utf8')}\n})`, {
    Buffer, URL, setTimeout, clearTimeout,
  }, { filename })(name => name === './legacy/create-order-core.cjs' ? f.core : realRequire(name),
    module, module.exports, { env: {} }, { log() {}, warn() {}, error() {} });
  let providerCreates = 0;
  await assert.rejects(module.exports.startStripeCheckout({
    input: {
      checkoutKey: 'checkout-rejection-regression-123456', confirmationTokenId: 'ctoken_isolated',
      expectedTotalCents: 6063, items: [f.item], discountCode: { code: 'NEW20' },
      customer: { email: 'returning@example.com', name: 'Test Buyer', phone: '5025550123' },
      shippingAddress: { name: 'Test Buyer', street: '123 Test Street', city: 'Louisville', state: 'KY', zip: '40299', country: 'US' },
    },
    runtime: { mode: 'test' },
    stripe: {
      confirmationTokens: { retrieve: async () => ({ livemode: false }) },
      paymentIntents: { create: async () => { providerCreates++; throw new Error('No charge allowed'); } },
    },
    sql: async () => { throw new Error('No order exists to load'); },
  }), error => error.code === 'DISCOUNT_CODE_INVALID' && error.statusCode === 400 && /first-order offer/.test(error.message));
  assert.equal(providerCreates, 0);
});
