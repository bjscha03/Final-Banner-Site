'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const policy = require('../_shared/recovery-discount-policy.cjs');
const {
  LARGE_BANNER_CONFLICT_MESSAGE,
  LARGE_BANNER_PROMO_ID,
  LARGE_BANNER_PROMO_LABEL,
  computeTotals,
} = require('../_shared/checkoutTotals.cjs');
const {
  validateDiscountForCheckout,
} = require('../_shared/discount-validation.cjs');

const line = (id, width, height, cents = 10_000, quantity = 1, productType = 'banner') => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: cents,
  quantity,
});

const options = { minFloorCents: 0, freeShipping: true };
const emptySql = async () => [];

test('server eligibility matrix uses exact two-dimension thresholds in either orientation', () => {
  const cases = [
    [48, 24, false],
    [72, 24, false],
    [60, 48, false],
    [108, 24, false],
    [72, 36, true],
    [36, 72, true],
    [84, 36, true],
    [96, 36, true],
    [72, 48, true],
    [96, 48, true],
    [120, 48, true],
    [71, 36, false],
    [72, 35, false],
  ];
  cases.forEach(([width, height, expected]) => {
    assert.equal(policy.isQualifyingLargeBannerLine(line(`${width}x${height}`, width, height)), expected);
  });
  assert.equal(policy.isQualifyingLargeBannerLine(line('yard', 72, 36, 10_000, 1, 'yard_sign')), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('magnet', 96, 48, 10_000, 1, 'car_magnet')), false);
});

test('6 × 2 receives no automatic discount and 6 × 3 receives exactly 25%', () => {
  const sixByTwo = computeTotals([line('six-by-two', 72, 24, 5_400)], 0.06, options);
  assert.equal(sixByTwo.automatic_promotion_eligible, false);
  assert.equal(sixByTwo.applied_discount_cents, 0);
  assert.equal(sixByTwo.total_cents, 5_724);

  const sixByThree = computeTotals([line('six-by-three', 72, 36, 8_100)], 0.06, options);
  assert.equal(sixByThree.automatic_promotion_eligible, true);
  assert.equal(sixByThree.applied_promotion_id, LARGE_BANNER_PROMO_ID);
  assert.equal(sixByThree.applied_discount_label, LARGE_BANNER_PROMO_LABEL);
  assert.equal(sixByThree.applied_discount_cents, 2_025);
  assert.equal(sixByThree.subtotal_after_discount_cents, 6_075);
  assert.equal(sixByThree.tax_cents, 365);
  assert.equal(sixByThree.total_cents, 6_440);
});

test('portrait dimensions and multiple qualifying quantities remain automatic', () => {
  const portrait = computeTotals([line('portrait', 36, 72, 8_100)], 0.06, options);
  assert.equal(portrait.applied_discount_cents, 2_025);

  const quantity = computeTotals([line('five-large', 72, 36, 40_500, 5)], 0.06, options);
  assert.equal(quantity.quantity_discount_candidate_cents, 5_265);
  assert.equal(quantity.automatic_promotion_cents, 10_125);
  assert.equal(quantity.applied_discount_cents, 10_125);
  assert.equal(quantity.applied_promotion_source, 'automatic');
});

test('20% cannot stack with automatic 25%, while a better percentage can replace it once', () => {
  const twenty = computeTotals(
    [line('large', 72, 36, 8_100)],
    0.06,
    options,
    { code: 'NEW20', discountPercentage: 20 },
  );
  assert.equal(twenty.applied_discount_cents, 2_025);
  assert.equal(twenty.applied_promotion_source, 'automatic');
  assert.equal(twenty.manual_promo_discount_cents, 1_620);
  assert.equal(twenty.discount_helper_message, LARGE_BANNER_CONFLICT_MESSAGE);

  const sixty = computeTotals(
    [line('large', 72, 36, 8_100)],
    0.06,
    options,
    { code: 'CUSTOM60', discountPercentage: 60 },
  );
  assert.equal(sixty.applied_discount_cents, 4_860);
  assert.equal(sixty.applied_promotion_source, 'promo_code');
  assert.equal(sixty.total_cents, 3_434);
});

test('mixed carts compare actual eligible savings and never compound percentages', () => {
  const items = [
    line('large', 72, 36, 8_100),
    line('small', 48, 24, 9_900),
    line('yard', 72, 36, 12_000, 1, 'yard_sign'),
  ];
  const totals = computeTotals(items, 0.06, options, {
    code: 'ORDER20',
    discountPercentage: 20,
  });
  assert.equal(totals.automatic_promotion_cents, 2_025);
  assert.equal(totals.manual_promo_discount_cents, 6_000);
  assert.equal(totals.applied_discount_cents, 6_000);
  assert.equal(totals.applied_promotion_source, 'promo_code');
  assert.equal(totals.subtotal_after_discount_cents, 24_000);
});

test('promo validation gives the customer a clean non-stacking message', async () => {
  const largeItems = [line('large', 72, 36, 8_100)];
  const blocked = await validateDiscountForCheckout({
    sql: emptySql,
    code: 'NEW20',
    items: largeItems,
  });
  assert.equal(blocked.valid, false);
  assert.equal(blocked.error, LARGE_BANNER_CONFLICT_MESSAGE);

  const smallItems = [line('small', 72, 24, 5_400)];
  const allowed = await validateDiscountForCheckout({
    sql: emptySql,
    code: 'NEW20',
    items: smallItems,
  });
  assert.equal(allowed.valid, true);
  assert.equal(allowed.discount.code, 'NEW20');
});

test('fixed-dollar promotions are audited separately and only the best discount applies', () => {
  const smallerFixed = computeTotals(
    [line('large', 72, 36, 8_100)],
    0.06,
    options,
    { code: 'SAVE10', discountAmountCents: 1_000 },
  );
  assert.equal(smallerFixed.applied_promotion_source, 'automatic');
  assert.equal(smallerFixed.applied_discount_cents, 2_025);

  const largerFixed = computeTotals(
    [line('large', 72, 36, 8_100)],
    0.06,
    options,
    { code: 'SAVE30', discountAmountCents: 3_000 },
  );
  assert.equal(largerFixed.applied_promotion_source, 'promo_code');
  assert.equal(largerFixed.applied_discount_cents, 3_000);
});
