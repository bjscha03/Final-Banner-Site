import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { getPromoDiscountSubtotalCents, resolveBestDiscount } from './discount-resolver';

const require = createRequire(import.meta.url);
const { validateDiscountForCheckout } = require('../../netlify/functions/_shared/discount-validation.cjs');
const { computeTotals } = require('../../netlify/functions/_shared/checkoutTotals.cjs');

async function validate(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'single-use-capped-promo', code: 'THANKYOU50-TEST',
    discount_percentage: 50, discount_amount_cents: null,
    discount_scope: 'order', max_discount_amount_cents: 15000,
    single_use: true, max_total_uses: 1, max_uses_per_customer: 1,
    used: false, used_by_email: [], expires_at: '2099-12-31T23:59:59Z',
    ...overrides,
  };
  const sql = async (strings: TemplateStringsArray) => (
    strings.join(' ').includes('FROM discount_codes') ? [row] : []
  );
  return validateDiscountForCheckout({ sql, code: row.code });
}

describe('single-use percentage coupons with a maximum savings amount', () => {
  it.each([
    [10000, 5000],
    [29999, 15000],
    [30000, 15000],
    [30001, 15000],
    [60000, 15000],
  ])('prices a %i-cent order consistently with a %i-cent discount', async (subtotal, expected) => {
    const result = await validate();
    expect(result.valid).toBe(true);
    expect(result.discount.maxDiscountAmountCents).toBe(15000);
    const items = [{ id: 'banner', product_type: 'banner', width_in: 48, height_in: 24,
      quantity: 1, line_total_cents: subtotal }];
    const server = computeTotals(items, 0.06, { freeShipping: true }, result.discount);
    const client = resolveBestDiscount({
      subtotalCents: subtotal, quantity: 1, promoDiscount: result.discount,
      promoSubtotalCents: getPromoDiscountSubtotalCents(items, subtotal, result.discount),
    });
    expect(server.applied_discount_cents).toBe(expected);
    expect(client.appliedDiscountAmountCents).toBe(expected);
    expect(server.total_cents).toBe(subtotal - expected + Math.round((subtotal - expected) * 0.06));
  });

  it('keeps uncapped coupons unchanged', async () => {
    const result = await validate({ max_discount_amount_cents: null });
    expect(result.discount).not.toHaveProperty('maxDiscountAmountCents');
    expect(resolveBestDiscount({ subtotalCents: 60000, quantity: 1,
      promoDiscount: result.discount }).appliedDiscountAmountCents).toBe(30000);
    expect(computeTotals([{ product_type: 'banner', quantity: 1, line_total_cents: 60000 }],
      0, {}, result.discount).applied_discount_cents).toBe(30000);
  });

  it('compares capped savings with quantity savings without stacking', async () => {
    const { discount } = await validate();
    const items = [{ id: 'banner', product_type: 'banner', width_in: 48, height_in: 24,
      quantity: 5, line_total_cents: 200000 }];
    const server = computeTotals(items, 0, {}, discount);
    const client = resolveBestDiscount({ subtotalCents: 200000, quantity: 5, promoDiscount: discount });
    expect(server.applied_discount_type).toBe('quantity');
    expect(server.applied_discount_cents).toBe(26000);
    expect(client.appliedDiscountType).toBe('quantity');
    expect(client.appliedDiscountAmountCents).toBe(26000);
  });

  it.each([0, -1, 1.5, 'invalid'])('fails closed for an invalid cap of %s', async (cap) => {
    const { discount } = await validate({ max_discount_amount_cents: cap });
    expect(resolveBestDiscount({ subtotalCents: 30000, quantity: 1,
      promoDiscount: discount }).appliedDiscountAmountCents).toBe(0);
    expect(computeTotals([{ product_type: 'banner', quantity: 1, line_total_cents: 30000 }],
      0, {}, discount).applied_discount_cents).toBe(0);
  });

  it.each([{ used: true }, { used_by_email: ['buyer@example.com'] }])(
    'rejects an already redeemed single-use coupon (%j)', async (overrides) => {
      const result = await validate(overrides);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/already been used/);
    },
  );
});
