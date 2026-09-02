'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
  AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL,
} = require('../_shared/recovery-discount-policy.cjs');
const { computeTotals } = require('../_shared/checkoutTotals.cjs');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');

const line = (
  id,
  productType,
  width,
  height,
  cents,
  quantity = 1,
) => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: cents,
  quantity,
});

const options = { minFloorCents: 0, freeShipping: true };

test('server automatically discounts a 6x3 banner by 25 percent', () => {
  const totals = computeTotals(
    [line('large', 'banner', 72, 36, 10_000)],
    0.06,
    options,
  );

  assert.equal(totals.applied_discount_type, 'promo');
  assert.equal(totals.applied_discount_cents, 2_500);
  assert.equal(totals.applied_discount_rate, 0.25);
  assert.equal(totals.applied_discount_label, AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL);
  assert.equal(totals.applied_promotion_id, AUTOMATIC_LARGE_BANNER_PROMOTION_ID);
  assert.equal(totals.tax_cents, 450);
  assert.equal(totals.total_cents, 7_950);
});

test('orientation is independent and 6x2 does not qualify', () => {
  const portrait = computeTotals(
    [line('portrait', 'banner', 36, 72, 10_000)],
    0.06,
    options,
  );
  const sixByTwo = computeTotals(
    [line('small', 'banner', 72, 24, 10_000)],
    0.06,
    options,
  );

  assert.equal(portrait.applied_discount_cents, 2_500);
  assert.equal(sixByTwo.applied_discount_type, 'none');
  assert.equal(sixByTwo.applied_discount_cents, 0);
  assert.equal(sixByTwo.total_cents, 10_600);
});

test('only qualifying banner lines receive the automatic discount', () => {
  const totals = computeTotals([
    line('large', 'banner', 96, 36, 12_000),
    line('small', 'banner', 48, 24, 8_000),
    line('yard', 'yard_sign', 72, 36, 10_000),
  ], 0.06, options);

  assert.equal(totals.adjusted_subtotal_cents, 30_000);
  assert.equal(totals.automatic_large_banner_discount_cents, 3_000);
  assert.equal(totals.applied_discount_cents, 3_000);
  assert.equal(totals.tax_cents, 1_620);
  assert.equal(totals.total_cents, 28_620);
});

test('automatic large-banner pricing never stacks with quantity savings', () => {
  const totals = computeTotals(
    [line('large', 'banner', 72, 36, 50_000, 5)],
    0.06,
    options,
  );

  assert.equal(totals.quantity_discount_rate, 0.13);
  assert.equal(totals.quantity_discount_cents, 0);
  assert.equal(totals.applied_discount_cents, 12_500);
  assert.equal(totals.applied_discount_label, AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL);
});

test('NEW20 resolves to the automatic offer for carts containing a qualifying banner', async () => {
  const sqlMustNotRun = () => {
    throw new Error('NEW20 automatic fallback must not query the database');
  };
  const items = [line('large', 'banner', 72, 36, 10_000)];
  const validated = await validateDiscountForCheckout({
    sql: sqlMustNotRun,
    code: 'NEW20',
    items,
  });

  assert.equal(validated.valid, true);
  assert.equal(validated.discount.code, AUTOMATIC_LARGE_BANNER_PROMOTION_ID);
  assert.equal(validated.discount.discountPercentage, 25);

  const totals = computeTotals(items, 0.06, options, validated.discount);
  assert.equal(totals.applied_discount_cents, 2_500);
  assert.equal(totals.applied_discount_label, AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL);
});

test('a 20 percent full-order promo cannot replace the automatic 25 percent offer', () => {
  const totals = computeTotals([
    line('large', 'banner', 72, 36, 10_000),
    line('small', 'banner', 48, 24, 10_000),
  ], 0.06, options, {
    code: 'SAVE20',
    discountPercentage: 20,
  });

  assert.equal(totals.applied_discount_cents, 2_500);
  assert.equal(totals.applied_discount_label, AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL);
  assert.match(totals.helper_message, /cannot be combined/i);
});

test('one larger promotion may replace the automatic offer without stacking', () => {
  const totals = computeTotals(
    [line('large', 'banner', 72, 36, 10_000)],
    0.06,
    options,
    { code: 'VIP30', discountPercentage: 30 },
  );

  assert.equal(totals.applied_discount_cents, 3_000);
  assert.equal(totals.applied_discount_label, 'VIP30 (30% off)');
  assert.equal(totals.automatic_large_banner_discount_cents, 2_500);
  assert.equal(totals.total_cents, 7_420);
});
