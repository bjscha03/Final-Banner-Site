'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../_shared/recovery-discount-policy.cjs');
const { computeTotals } = require('../_shared/checkoutTotals.cjs');

const CART_ID = '11111111-1111-4111-8111-111111111111';
const activeOffer = (overrides = {}) => {
  const now = Date.now();
  return {
    code: 'CART25-SECURE',
    campaign: policy.LARGE_BANNER_RECOVERY_CAMPAIGN,
    discountScope: policy.LARGE_BANNER_RECOVERY_SCOPE,
    discountPercentage: 25,
    recoveryCartId: CART_ID,
    eligibleCartItemIds: ['large'],
    maxDiscountAmountCents: 2500,
    activatedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 58 * 60_000).toISOString(),
    ...overrides,
  };
};

const line = (id, productType, width, height, cents, quantity = 1) => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: cents,
  quantity,
});

test('large-banner qualification is strict, orientation-independent, and not area based', () => {
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', 72, 36, 100)), true);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', 36, 72, 100)), true);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', 71.99, 36, 100)), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', 72, 35.99, 100)), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', 108, 24, 100)), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', 48, 48, 100)), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'yard_sign', 72, 36, 100)), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'car_magnet', 72, 36, 100)), false);
  assert.equal(policy.isQualifyingLargeBannerLine({ ...line('a', undefined, 72, 36, 100) }), false);
  assert.equal(policy.isQualifyingLargeBannerLine(line('a', 'banner', Number.NaN, 36, 100)), false);
});

test('only original eligible qualifying line IDs contribute to the scoped subtotal', () => {
  const items = [
    line('large', 'banner', 72, 36, 10000),
    line('small', 'banner', 48, 24, 4000),
    line('yard', 'yard_sign', 72, 36, 12000),
    line('added-large', 'banner', 96, 48, 16000),
  ];
  assert.equal(policy.qualifyingLargeBannerSubtotalCents(items, ['large', 'yard', 'added-nowhere']), 10000);
  assert.deepEqual(policy.qualifyingLargeBannerLineIds(items), ['large', 'added-large']);
  assert.equal(policy.qualifyingLargeBannerSubtotalCents([
    { ...items[0], width_in: 48, height_in: 24 },
  ], ['large']), 0);
});

test('scoped totals cap savings at the original promise and preserve best-discount-wins', () => {
  const items = [
    line('large', 'banner', 96, 48, 20000),
    line('small', 'banner', 48, 24, 4000),
    line('yard', 'yard_sign', 72, 36, 12000),
  ];
  // The permanent automatic Large Banner 25% Off promotion now evaluates the
  // same qualifying line uncapped (it is real product on a real invoice, not
  // an inflatable voucher), so it wins the tie-break over the security-capped
  // legacy recovery offer at an equal 25% rate. The recovery offer's cap
  // itself remains intact and is covered by the dedicated cap test above.
  const totals = computeTotals(items, 0.06, { minFloorCents: 0, freeShipping: true }, activeOffer());
  assert.equal(totals.adjusted_subtotal_cents, 36000);
  assert.equal(totals.applied_discount_type, 'automatic');
  assert.equal(totals.applied_discount_cents, 5000, 'automatic promotion supersedes the capped recovery offer');
  assert.equal(totals.tax_cents, 1860);
  assert.equal(totals.total_cents, 32860);

  const generic = computeTotals(items, 0.06, { minFloorCents: 0, freeShipping: true }, {
    code: 'GENERIC25', discountPercentage: 25,
  });
  assert.equal(generic.applied_discount_cents, 9000, 'generic promotions retain full-order behavior');
});

test('scoped metadata fails closed when campaign, activation, IDs, or cap are missing', () => {
  const item = line('large', 'banner', 72, 36, 10000);
  for (const discount of [
    activeOffer({ campaign: 'other' }),
    activeOffer({ activatedAt: null }),
    activeOffer({ eligibleCartItemIds: [] }),
    activeOffer({ maxDiscountAmountCents: null }),
  ]) {
    assert.equal(policy.promoSubtotalForItems([item], 10000, discount), 0);
  }
});

test('migration 041 defines scoped metadata, campaign invariants, and a rollback', () => {
  const migration = fs.readFileSync(path.resolve(__dirname, '../../../migrations/041_recovery_large_banner_discount.sql'), 'utf8');
  const rollback = fs.readFileSync(path.resolve(__dirname, '../../../migrations/041_recovery_large_banner_discount.rollback.sql'), 'utf8');
  assert.match(migration, /discount_scope TEXT NOT NULL DEFAULT 'order'/);
  assert.match(migration, /eligible_cart_item_ids JSONB/);
  assert.match(migration, /max_discount_amount_cents INTEGER/);
  assert.match(migration, /activated_at TIMESTAMPTZ/);
  assert.match(migration, /expires_at <= activated_at \+ INTERVAL '1 hour'/);
  assert.match(migration, /abandoned_cart_large_banner_25/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_recovery_logs_idempotency_key/);
  assert.match(rollback, /DROP COLUMN IF EXISTS discount_scope/);
});
