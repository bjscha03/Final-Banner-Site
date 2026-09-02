'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const policy = require('../_shared/recovery-discount-policy.cjs');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const {
  LARGE_BANNER_CONFLICT_MESSAGE,
  LARGE_BANNER_PROMO_ID,
  computeTotals,
} = require('../_shared/checkoutTotals.cjs');

const line = (id, productType, width, height, cents, quantity = 1) => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: cents,
  quantity,
});

const sqlMustNotRun = async () => { throw new Error('automatic large-banner pricing must not query a coupon row'); };
const activeNow = new Date('2026-09-08T18:00:00.000Z');
const options = { minFloorCents: 0, freeShipping: true };

test('BIG25 is redundant because 6x3, 3x6, and larger banners are discounted automatically', async () => {
  for (const item of [
    line('six-by-three', 'banner', 72, 36, 10000),
    line('three-by-six', 'banner', 36, 72, 10000),
    line('eight-by-four', 'banner', 96, 48, 18000),
  ]) {
    const result = await validateDiscountForCheckout({
      sql: sqlMustNotRun,
      code: 'big25',
      items: [item],
      now: activeNow,
    });
    assert.equal(result.valid, false);
    assert.equal(result.error, LARGE_BANNER_CONFLICT_MESSAGE);

    const totals = computeTotals([item], 0.06, options);
    assert.equal(totals.applied_promotion_id, LARGE_BANNER_PROMO_ID);
    assert.equal(totals.applied_discount_cents, Math.round(item.line_total_cents * 0.25));
  }
});

test('BIG25 cannot create eligibility for banners below either threshold or unrelated products', async () => {
  for (const item of [
    line('too-short', 'banner', 72, 35.99, 8000),
    line('too-narrow', 'banner', 71.99, 36, 8000),
    line('wrong-shape', 'banner', 108, 24, 8000),
    line('square', 'banner', 48, 48, 8000),
    line('yard', 'yard_sign', 72, 36, 12000),
    line('magnet', 'car_magnet', 72, 36, 12000),
  ]) {
    const result = await validateDiscountForCheckout({
      sql: sqlMustNotRun,
      code: 'BIG25',
      items: [item],
      now: activeNow,
    });
    assert.equal(result.valid, false, item.id);
    assert.match(result.error, /6' × 3'/);
    const totals = computeTotals([item], 0.06, options);
    assert.equal(totals.automatic_promotion_eligible, false, item.id);
  }
});

test('automatic promotion discounts only qualifying banner lines and never stacks with quantity savings', () => {
  const items = [
    line('large', 'banner', 72, 36, 10000),
    line('small', 'banner', 48, 24, 4000),
    line('yard', 'yard_sign', 72, 36, 12000),
  ];
  const totals = computeTotals(items, 0.06, options);
  assert.equal(totals.adjusted_subtotal_cents, 26000);
  assert.equal(totals.applied_discount_type, 'promo');
  assert.equal(totals.applied_promotion_id, LARGE_BANNER_PROMO_ID);
  assert.equal(totals.applied_discount_cents, 2500, '25% applies to the $100 qualifying line only');
  assert.equal(totals.quantity_discount_cents, 0, 'only the winning discount is applied');
  assert.equal(totals.quantity_discount_candidate_cents, 700);
  assert.equal(totals.tax_cents, 1410);
  assert.equal(totals.total_cents, 24910);
});

test('legacy September campaign boundaries remain defined for historical records', () => {
  assert.equal(policy.buildSeptemberLargeBannerDiscount(new Date('2026-09-01T03:59:59.999Z')).valid, false);
  assert.equal(policy.buildSeptemberLargeBannerDiscount(new Date(policy.SEPTEMBER_LARGE_BANNER_START)).valid, true);
  assert.equal(policy.buildSeptemberLargeBannerDiscount(new Date('2026-09-09T03:59:59.999Z')).valid, true);
  assert.equal(policy.buildSeptemberLargeBannerDiscount(new Date(policy.SEPTEMBER_LARGE_BANNER_END_EXCLUSIVE)).valid, false);
});
