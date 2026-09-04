'use strict';

// Regression coverage for the 20OFF rollout follow-up (Issue #496 gap-fix).
// 20OFF must resolve to its OWN metadata (never LARGE_BANNER_25 metadata)
// even when a qualifying 6' x 3'+ banner is in the cart, so it stays
// "remembered" if the customer later switches back to a smaller banner.
// Authoritative totals independently compute the automatic 25% and pick
// whichever discount is larger — this is what actually prevents stacking.

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../_shared/recovery-discount-policy.cjs');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const { computeTotals } = require('../_shared/checkoutTotals.cjs');

// apply-discount.cjs always probes `trade_show_promo_codes` before its
// virtual-code branches (same as the existing NEW20 handling). Stub the
// Neon driver so this test never depends on a live database connection —
// 20OFF must resolve without ever reaching the "standard flow" DB lookup.
const neonModulePath = require.resolve('@neondatabase/serverless');
require.cache[neonModulePath] = {
  id: neonModulePath,
  filename: neonModulePath,
  loaded: true,
  exports: { neon: () => async () => [] },
};
const legacyApplyDiscount = require('../_shared/legacy/apply-discount.cjs');
delete require.cache[neonModulePath];

const line = (id, productType, width, height, cents, quantity = 1) => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: cents,
  quantity,
});

const options = { minFloorCents: 0, freeShipping: true };
const sqlMustNotRun = async () => { throw new Error('20OFF must not query a mutable coupon row'); };

test('20OFF resolves to small-banner metadata even with a qualifying 6x3+ banner in the cart', async () => {
  const items = [line('large', 'banner', 72, 36, 10000)];
  const result = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: '20off', items });
  assert.equal(result.valid, true);
  assert.equal(result.discount.code, policy.SMALL_BANNER_DISCOUNT_CODE);
  assert.equal(result.discount.discountPercentage, 20);
  assert.equal(result.discount.discountScope, policy.SMALL_BANNER_SCOPE);
  assert.equal(result.discount.campaign, policy.SMALL_BANNER_DISCOUNT_CAMPAIGN);
});

test('20OFF is rejected when the cart has no banner line at all', async () => {
  const items = [line('yard', 'yard_sign', 72, 36, 8000), line('magnet', 'car_magnet', 48, 24, 3000)];
  const result = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: '20OFF', items });
  assert.equal(result.valid, false);
  assert.match(result.error, /requires a banner/);
});

test('4x2 banner + 20OFF = 20% off', async () => {
  const items = [line('small', 'banner', 48, 24, 5000)];
  const validated = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: '20OFF', items });
  assert.equal(validated.valid, true);
  const totals = computeTotals(items, 0.06, options, validated.discount);
  assert.equal(totals.applied_discount_type, 'promo');
  assert.equal(totals.applied_discount_cents, 1000);
  assert.equal(totals.applied_promotion_id, null);
  assert.equal(totals.applied_promo_code, policy.SMALL_BANNER_DISCOUNT_CODE);
});

test('6x3 banner + 20OFF = 25% (authoritative totals pick the automatic discount, not 20OFF metadata)', async () => {
  const items = [line('large', 'banner', 72, 36, 10000)];
  const validated = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: '20OFF', items });
  assert.equal(validated.valid, true);
  assert.equal(validated.discount.code, policy.SMALL_BANNER_DISCOUNT_CODE, '20OFF metadata is preserved, not upgraded to LARGE_BANNER_25');
  const totals = computeTotals(items, 0.06, options, validated.discount);
  assert.equal(totals.applied_discount_type, 'promo');
  assert.equal(totals.applied_discount_cents, 2500, '25% wins even though the stored discount metadata is still 20OFF');
  assert.equal(totals.applied_promotion_id, policy.AUTOMATIC_LARGE_BANNER_PROMOTION_ID);
});

test('4x2 -> 6x3 -> 4x2: 20OFF metadata never changes, but the winning discount tracks the cart', () => {
  const smallBannerDiscount = policy.buildSmallBannerDiscount();

  const small1 = computeTotals([line('a', 'banner', 48, 24, 5000)], 0.06, options, smallBannerDiscount);
  assert.equal(small1.applied_discount_cents, 1000, '20% on the initial small banner');

  const large = computeTotals([line('a', 'banner', 72, 36, 10000)], 0.06, options, smallBannerDiscount);
  assert.equal(large.applied_discount_cents, 2500, '25% automatically wins once the banner grows to 6x3');
  assert.equal(large.applied_promotion_id, policy.AUTOMATIC_LARGE_BANNER_PROMOTION_ID);

  const small2 = computeTotals([line('a', 'banner', 48, 24, 5000)], 0.06, options, smallBannerDiscount);
  assert.equal(small2.applied_discount_cents, 1000, '20OFF applies again after switching back to a smaller banner');
  assert.equal(small2.applied_promotion_id, null);
});

test('20OFF discounts only the qualifying small-banner lines, never a large banner or non-banner line', async () => {
  const items = [
    line('small', 'banner', 48, 24, 4000),
    line('large', 'banner', 96, 48, 16000),
    line('yard', 'yard_sign', 72, 36, 12000),
  ];
  const validated = await validateDiscountForCheckout({ sql: sqlMustNotRun, code: '20OFF', items });
  const totals = computeTotals(items, 0.06, options, validated.discount);
  // The large line makes the automatic 25% win overall, but only on its own
  // subtotal — the resolver never applies 20OFF's rate to the large/yard lines.
  assert.equal(totals.applied_discount_type, 'promo');
  assert.equal(totals.applied_promotion_id, policy.AUTOMATIC_LARGE_BANNER_PROMOTION_ID);
  assert.equal(totals.applied_discount_cents, 4000, '25% applies only to the $160 qualifying large-banner line');
});

test('legacy apply-discount treats 20OFF as a virtual, reusable code (no database row required)', async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
  const response = await legacyApplyDiscount.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ code: '20off', orderId: 'order-123' }),
  });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.success, true);
  assert.equal(body.code, policy.SMALL_BANNER_DISCOUNT_CODE);
  assert.equal(body.discountPercentage, 20);
  assert.equal(body.discountAmountCents, null);
});
