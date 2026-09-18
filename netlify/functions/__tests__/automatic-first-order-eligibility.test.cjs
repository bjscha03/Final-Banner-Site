'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE orders (
    id text, user_id uuid, email text, status text, discount_code text,
    is_test_order boolean DEFAULT false, checkout_idempotency_key text,
    payment_reconciliation_status text, paypal_capture_id text
  );`);
});
after(async () => { await db.close(); });
const sql = async (strings, ...values) => (await db.query(
  strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, ''), values,
)).rows;
const userId = '11111111-1111-4111-8111-111111111111';
async function order(overrides = {}) {
  const row = { id: 'prior', email: 'buyer@example.com', status: 'paid', user_id: userId,
    discount_code: 'OTHER25', is_test_order: false, checkout_idempotency_key: 'old-checkout',
    payment_reconciliation_status: 'complete', paypal_capture_id: null, ...overrides };
  await db.exec('DELETE FROM orders');
  const columns = Object.keys(row);
  await db.query(`INSERT INTO orders (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
}
const validate = (extra = {}) => validateDiscountForCheckout({ sql, code: 'NEW20', email: 'buyer@example.com', ...extra });
test('guest first purchase receives exactly 20 percent', async () => {
  await db.exec('DELETE FROM orders');
  const result = await validate();
  assert.equal(result.valid, true); assert.equal(result.discount.discountPercentage, 20);
});
for (const status of ['paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded']) {
  test(`guest with a ${status} order cannot reuse first-order pricing, regardless of previous code`, async () => {
    await order({ status });
    assert.equal((await validate({ email: ' BUYER@EXAMPLE.COM ' })).valid, false);
  });
}
test('matches the account even when checkout email changes', async () => {
  await order(); assert.equal((await validate({ userId, email: 'different@example.com' })).valid, false);
});
test('a different customer remains eligible', async () => {
  await order(); assert.equal((await validate({ email: 'new@example.com' })).valid, true);
});
for (const status of ['pending', 'cancelled', 'failed']) {
  test(`an unpaid ${status} attempt does not consume the first order`, async () => {
    await order({ status, payment_reconciliation_status: 'awaiting_capture' });
    assert.equal((await validate()).valid, true);
  });
}
test('test orders do not consume real first-order eligibility', async () => {
  await order({ is_test_order: true }); assert.equal((await validate()).valid, true);
});
test('a captured payment pending reconciliation counts as a purchase', async () => {
  await order({ status: 'pending', payment_reconciliation_status: 'awaiting_capture', paypal_capture_id: 'CAPTURE-1' });
  assert.equal((await validate()).valid, false);
});
test('the same checkout may retry, a different checkout may not', async () => {
  await order(); assert.equal((await validate({ checkoutKey: 'old-checkout' })).valid, true);
  assert.equal((await validate({ checkoutKey: 'new-checkout' })).valid, false);
});
test('database failure never grants verified eligibility', async () => {
  await assert.rejects(validate({ sql: async () => { throw new Error('database offline'); } }), /database offline/);
});
