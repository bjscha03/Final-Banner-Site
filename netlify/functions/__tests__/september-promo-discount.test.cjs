'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const policy = require('../_shared/recovery-discount-policy.cjs');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const { computeTotals } = require('../_shared/checkoutTotals.cjs');

const line = (id, productType, width, height, cents, quantity = 1) => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: cents,
  quantity,
});

const sqlMustNotRun = async () => { throw new Error('BIG25 must not query a mutable coupon row'); };
const activeNow = new Date('2026-09-08T18:00:00.000Z');

test('BIG25 recognizes 6x3, 3x6, and larger banners without querying a coupon row', async () => {
  for (const item of [
    line('six-by-three', 'banner', 72, 36, 10000),
    line('three-by-six', 'banner', 36, 72, 10000),
    line('eight-by-four', 'banner', 96, 48, 18000),
  ]) {
    const result = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'big25', items: [item], now: activeNow });
    assert.equal(result.valid, true);
    assert.equal(result.discount.code, 'BIG25');
    assert.equal(result.discount.discountPercentage, 25);
    assert.equal(result.discount.discountScope, policy.SEPTEMBER_LARGE_BANNER_SCOPE);
  }
});

test('BIG25 rejects banners below either threshold and unrelated products', async () => {
  for (const item of [
    line('too-short', 'banner', 72, 35.99, 8000),
    line('too-narrow', 'banner', 71.99, 36, 8000),
    line('wrong-shape', 'banner', 108, 24, 8000),
    line('square', 'banner', 48, 48, 8000),
    line('yard', 'yard_sign', 72, 36, 12000),
    line('magnet', 'car_magnet', 72, 36, 12000),
  ]) {
    const result = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'BIG25', items: [item], now: activeNow });
    assert.equal(result.valid, false, item.id);
    assert.match(result.error, /6' × 3'/);
  }
});

test('BIG25 discounts only qualifying banner lines and never stacks with quantity savings', async () => {
  const items = [
    line('large', 'banner', 72, 36, 10000),
    line('small', 'banner', 48, 24, 4000),
    line('yard', 'yard_sign', 72, 36, 12000),
  ];
  const validated = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'BIG25', items, now: activeNow });
  // The permanent automatic Large Banner 25% Off promotion also qualifies the
  // same line at an equal 25% rate; best-discount-wins prefers the automatic
  // promotion on ties, so it supersedes the entered BIG25 promo code here.
  const totals = computeTotals(items, 0.06, { minFloorCents: 0, freeShipping: true }, validated.discount);
  assert.equal(totals.adjusted_subtotal_cents, 26000);
  assert.equal(totals.applied_discount_type, 'automatic');
  assert.equal(totals.applied_discount_cents, 2500, '25% applies to the $100 qualifying line only');
  assert.equal(totals.quantity_discount_cents, 0, 'best-discount-wins prevents stacking');
  assert.equal(totals.tax_cents, 1410);
  assert.equal(totals.total_cents, 24910);
});

test('BIG25 is active September 1 through September 8 Eastern and expires at the exclusive boundary', async () => {
  const item = line('large', 'banner', 72, 36, 10000);
  const before = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'BIG25', items: [item], now: new Date('2026-09-01T03:59:59.999Z') });
  const starts = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'BIG25', items: [item], now: new Date(policy.SEPTEMBER_LARGE_BANNER_START) });
  const finalSecond = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'BIG25', items: [item], now: new Date('2026-09-09T03:59:59.999Z') });
  const expired = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: 'BIG25', items: [item], now: new Date(policy.SEPTEMBER_LARGE_BANNER_END_EXCLUSIVE) });
  assert.equal(before.valid, false);
  assert.match(before.error, /begins September 1/);
  assert.equal(starts.valid, true);
  assert.equal(finalSecond.valid, true);
  assert.equal(expired.valid, false);
  assert.match(expired.error, /expired after September 8/);
});
