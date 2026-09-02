'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  newCustomerCodeStillEligible,
  savedDiscountCodeFromCheckoutState,
  selectWinningRecoveryDiscount,
} = require('../_shared/abandoned-cart-discount-selection.cjs');

const CART_ID = '11111111-1111-4111-8111-111111111111';
const ITEMS = [{
  id: 'line-1',
  product_type: 'banner',
  width_in: 72,
  height_in: 36,
  quantity: 1,
  material: '13oz',
  line_total_cents: 9_999_999,
}];

const discount = (code, percentage) => ({
  id: code,
  code,
  discountPercentage: percentage,
  discountAmountCents: null,
  expiresAt: '2099-12-31T23:59:59.000Z',
  source: 'discount_codes',
});

const noSqlExpected = async () => {
  throw new Error('unexpected SQL');
};

test('normalizes only bounded saved discount codes', () => {
  assert.equal(savedDiscountCodeFromCheckoutState({ discountCode: ' save-30 ' }), 'SAVE-30');
  assert.equal(savedDiscountCodeFromCheckoutState('{"discountCode":"new20"}'), 'NEW20');
  assert.equal(savedDiscountCodeFromCheckoutState({ discountCode: 'not valid!' }), null);
  assert.equal(savedDiscountCodeFromCheckoutState({ discountCode: 'A'.repeat(81) }), null);
});

test('restores a valid saved code for a small cart using exact identity requirements', async () => {
  let validationInput = null;
  const result = await selectWinningRecoveryDiscount({
    sql: noSqlExpected,
    checkoutState: { discountCode: 'SAVE30' },
    items: ITEMS,
    cartId: CART_ID,
    email: 'Buyer@Example.com',
    userId: '22222222-2222-4222-8222-222222222222',
    validateDiscount: async (input) => {
      validationInput = input;
      return { valid: true, discount: discount('SAVE30', 30) };
    },
  });

  assert.equal(result.code, 'SAVE30');
  assert.equal(result.source, 'saved');
  assert.equal(validationInput.email, 'buyer@example.com');
  assert.equal(validationInput.recoveryCartId, CART_ID);
  assert.equal(validationInput.requireRecoveryEmailMatch, true);
  assert.equal(validationInput.requireRecoveryCartMatch, true);
});

test('omits expired, invalid, or foreign saved codes', async () => {
  const result = await selectWinningRecoveryDiscount({
    sql: noSqlExpected,
    checkoutState: { discountCode: 'FOREIGN25' },
    recoveryCode: null,
    items: ITEMS,
    cartId: CART_ID,
    email: 'buyer@example.com',
    validateDiscount: async () => ({ valid: false, error: 'different cart' }),
  });
  assert.deepEqual(result, { code: null, discount: null, source: 'none' });
});

test('canonical repricing selects a stronger saved code over RECOVER25', async () => {
  const result = await selectWinningRecoveryDiscount({
    sql: noSqlExpected,
    checkoutState: { discountCode: 'SAVE30' },
    recoveryCode: 'RECOVER25-EXACT',
    items: ITEMS,
    cartId: CART_ID,
    email: 'buyer@example.com',
    validateDiscount: async ({ code }) => ({
      valid: true,
      discount: code === 'SAVE30' ? discount('SAVE30', 30) : discount('RECOVER25-EXACT', 25),
    }),
    // The captured 9,999,999-cent line is deliberately ignored.
    reprice: () => [{ ...ITEMS[0], line_total_cents: 10_000 }],
    flags: { freeShipping: true, minOrderFloor: false, minOrderCents: 0 },
  });

  assert.equal(result.code, 'SAVE30');
  assert.equal(result.source, 'saved');
  assert.equal(result.canonicalItems[0].line_total_cents, 10_000);
  assert.equal(result.totals.applied_discount_cents, 3_000);
});

test('RECOVER25 wins when the validated saved code is weaker', async () => {
  // Uses a non-large-banner line so the outcome isolates the saved-vs-recovery
  // selection logic from the permanent automatic Large Banner 25% Off
  // promotion (which would otherwise tie with RECOVER25-EXACT on a
  // qualifying line and mask this comparison).
  const smallItem = { ...ITEMS[0], width_in: 48, height_in: 24 };
  const result = await selectWinningRecoveryDiscount({
    sql: noSqlExpected,
    checkoutState: { discountCode: 'SAVE10' },
    recoveryCode: 'RECOVER25-EXACT',
    items: [smallItem],
    cartId: CART_ID,
    email: 'buyer@example.com',
    validateDiscount: async ({ code }) => ({
      valid: true,
      discount: code === 'SAVE10' ? discount('SAVE10', 10) : discount('RECOVER25-EXACT', 25),
    }),
    reprice: () => [{ ...smallItem, line_total_cents: 10_000 }],
    flags: { freeShipping: true, minOrderFloor: false, minOrderCents: 0 },
  });

  assert.equal(result.code, 'RECOVER25-EXACT');
  assert.equal(result.source, 'recovery');
  assert.equal(result.totals.applied_discount_cents, 2_500);
});

test('NEW20 is never promised to a known prior customer', async () => {
  let queryText = '';
  const eligible = await newCustomerCodeStillEligible(async (strings) => {
    queryText = strings.join(' ');
    return [{ id: 'prior-order' }];
  }, {
    code: 'NEW20',
    email: 'repeat@example.com',
    userId: null,
  });

  assert.equal(eligible, false);
  assert.match(queryText, /COALESCE\(order_row\.is_test_order, FALSE\) = FALSE/);
  assert.match(queryText, /LOWER\(BTRIM\(order_row\.email\)\)/);
});
