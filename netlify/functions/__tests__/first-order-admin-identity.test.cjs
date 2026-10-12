const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
for (const userId of ['server-admin', 'preview-admin', 'invalid-id']) {
  test(`${userId} never reaches a UUID cast and still checks the checkout email`, async () => {
    let calls = 0;
    const sql = async (parts, ...values) => {
      calls++;
      assert.equal(values[0], null);
      assert.equal(values[1], null);
      assert.ok(values.includes('returning@example.invalid'));
      return [{ id: 'existing-paid-order' }];
    };
    const result = await validateDiscountForCheckout({ sql, code: 'NEW20', userId, email: 'Returning@Example.invalid' });
    assert.equal(result.valid, false);
    assert.equal(calls, 1);
    assert.equal((await validateDiscountForCheckout({ sql: () => { throw Error('No identity'); }, code: 'NEW20', userId })).valid, true);
  });
}
test('a real customer UUID is retained in the first-order history lookup', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const result = await validateDiscountForCheckout({ code: 'NEW20', userId, sql: async (_parts, ...values) => {
    assert.equal(values[0], userId); assert.equal(values[1], userId); return [{ id: 'paid' }];
  }});
  assert.equal(result.valid, false);
});
