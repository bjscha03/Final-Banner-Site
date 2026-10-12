'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDiscountForCheckout } = require('../_shared/discount-validation.cjs');
const { computeTotals } = require('../_shared/checkoutTotals.cjs');
const reservation = require('../_shared/payment-discount-reservation.cjs');
const { getReusablePromotion } = require('../_shared/reusable-promotions.cjs');

const noCouponSql = async () => { throw new Error('Reusable promotion must not read or consume coupon rows'); };
const items = [{ id: 'banner', product_type: 'banner', width_in: 72, height_in: 36, line_total_cents: 10000, quantity: 1 }];

test('Sarah30 stays valid for repeat customers, shared users, mixed case, and future dates', async () => {
  for (const email of ['sarah@example.com', 'sarah@example.com', 'friend@example.com']) {
    for (const code of ['Sarah30', ' sarah30 ', 'SARAH30']) {
      const result = await validateDiscountForCheckout({ sql: noCouponSql, code, email, items, now: new Date('2200-01-01') });
      assert.equal(result.valid, true);
      assert.equal(result.discount.discountPercentage, 30);
      assert.equal(result.discount.expiresAt, null);
      const totals = computeTotals(items, 0.06, { minFloorCents: 0, freeShipping: true }, result.discount);
      assert.equal(totals.applied_discount_cents, 3000);
      assert.equal(totals.applied_promo_code, 'SARAH30');
    }
  }
  assert.equal(getReusablePromotion('SARAH30EXTRA'), null);
  assert.equal(getReusablePromotion('NEW20'), null);
});

test('Sarah30 can be claimed and completed by multiple orders without consuming a coupon', async () => {
  const oldEnabled = process.env.BOF_REFERRAL_ENABLED;
  const oldLaunched = process.env.BOF_REFERRAL_LAUNCHED_AT;
  delete process.env.BOF_REFERRAL_ENABLED;
  delete process.env.BOF_REFERRAL_LAUNCHED_AT;
  try {
    for (const id of ['first-order', 'second-order', 'friend-order']) {
      const order = { id, discount_code: 'Sarah30', applied_discount_type: 'promo', applied_discount_cents: 3000 };
      assert.deepEqual(await reservation.claimPaymentDiscount(noCouponSql, order), { ok: true, claimed: false, kind: 'reusable_promotion' });
      assert.deepEqual(await reservation.completePaymentDiscount(noCouponSql, order), { ok: true, kind: 'not_stored' });
      const writes = [];
      await reservation.releasePaymentDiscount(async (parts) => { writes.push(parts.join('?')); return []; }, order);
      assert.equal(writes.length, 1);
      assert.match(writes[0], /UPDATE orders/);
    }
  } finally {
    if (oldEnabled === undefined) delete process.env.BOF_REFERRAL_ENABLED; else process.env.BOF_REFERRAL_ENABLED = oldEnabled;
    if (oldLaunched === undefined) delete process.env.BOF_REFERRAL_LAUNCHED_AT; else process.env.BOF_REFERRAL_LAUNCHED_AT = oldLaunched;
  }
});

test('legacy apply and validation endpoints accept repeated Sarah30 uses without database writes', async () => {
  const modulePath = require.resolve('@neondatabase/serverless');
  const original = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: { neon: () => noCouponSql } };
  const apply = require('../_shared/legacy/apply-discount.cjs');
  const validate = require('../_shared/legacy/validate-discount.cjs');
  const oldUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'test-only';
  try {
    for (let i = 0; i < 3; i++) {
      const event = { httpMethod: 'POST', body: JSON.stringify({ code: 'Sarah30', orderId: `test-${i}`, email: 'sarah@example.com' }) };
      const applied = await apply.handler(event);
      assert.equal(applied.statusCode, 200);
      assert.equal(JSON.parse(applied.body).discountPercentage, 30);
      const validated = await validate.handler(event);
      assert.equal(JSON.parse(validated.body).valid, true);
    }
  } finally {
    if (original) require.cache[modulePath] = original; else delete require.cache[modulePath];
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  }
});
