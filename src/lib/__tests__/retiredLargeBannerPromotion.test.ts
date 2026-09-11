import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolveBestDiscount } from '../discount-resolver';
const require = createRequire(import.meta.url);
const { computeTotals } = require('../../../netlify/functions/_shared/checkoutTotals.cjs');
const { validateDiscountForCheckout } = require('../../../netlify/functions/_shared/discount-validation.cjs');
const options = { freeShipping: true, minFloorCents: 0 };
const item = { id: 'banner', product_type: 'banner', width_in: 72, height_in: 36, quantity: 1, line_total_cents: 8100 };

describe('retired large-banner promotion / restored landing pricing', () => {
  it('prices the default 6x3 at $81 before tax on client and server', () => {
    const client = resolveBestDiscount({ subtotalCents: 8100, quantity: 1, automaticLargeBannerSubtotalCents: 8100 });
    const server = computeTotals([item], 0.06, options);
    expect(client.appliedDiscountAmountCents).toBe(0);
    expect(server.subtotal_after_discount_cents).toBe(8100);
    expect(server.total_cents).toBe(8586);
    expect(server.automatic_large_banner_discount_cents).toBe(0);
  });
  it('NEW20 remains a manual 20% discount on large banners', async () => {
    const validation = await validateDiscountForCheckout({ code: 'NEW20', items: [item], sql: async () => [] });
    expect(validation.valid).toBe(true);
    expect(validation.discount.code).toBe('NEW20');
    const client = resolveBestDiscount({ subtotalCents: 8100, quantity: 1, automaticLargeBannerSubtotalCents: 8100, promoDiscount: validation.discount });
    const server = computeTotals([item], 0.06, options, validation.discount);
    expect(client.appliedDiscountAmountCents).toBe(1620);
    expect(server.subtotal_after_discount_cents).toBe(6480);
    expect(server.total_cents).toBe(6869);
  });
  it.each(['BIG25', 'LARGE_BANNER_25'])('rejects retired %s and does not revive cached discounts', async code => {
    expect((await validateDiscountForCheckout({ code, items: [item], sql: async () => [] })).valid).toBe(false);
    const cached = { code, discountPercentage: 25 };
    expect(resolveBestDiscount({ subtotalCents: 8100, quantity: 1, promoDiscount: cached }).appliedDiscountAmountCents).toBe(0);
    expect(computeTotals([item], 0.06, options, cached).applied_discount_cents).toBe(0);
  });
  it('keeps the ordinary quantity discount instead of the retired automatic offer', () => {
    const client = resolveBestDiscount({ subtotalCents: 16200, quantity: 2, automaticLargeBannerSubtotalCents: 16200 });
    const server = computeTotals([{ ...item, quantity: 2, line_total_cents: 16200 }], 0.06, options);
    expect(client.appliedDiscountAmountCents).toBe(810);
    expect(server.applied_discount_cents).toBe(810);
    expect(server.applied_discount_type).toBe('quantity');
  });
});
