import { describe, expect, it } from 'vitest';
import {
  getPromoDiscountSubtotalCents,
  isQualifyingLargeBannerDiscountItem,
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_SCOPE,
  resolveBestDiscount,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
} from './discount-resolver';

const item = (
  id: string,
  productType: string | undefined,
  width: number,
  height: number,
  lineTotalCents: number,
): PromoDiscountCartItem => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: lineTotalCents,
});

const scopedOffer = (overrides: Partial<PromoDiscountInput> = {}): PromoDiscountInput => ({
  code: 'CART25-SECURE',
  discountPercentage: 25,
  campaign: LARGE_BANNER_RECOVERY_CAMPAIGN,
  discountScope: LARGE_BANNER_RECOVERY_SCOPE,
  eligibleCartItemIds: ['large'],
  maxDiscountAmountCents: 2500,
  ...overrides,
});

describe('large-banner recovery discount client parity', () => {
  it('uses the strict orientation-independent 72 by 36 rule', () => {
    expect(isQualifyingLargeBannerDiscountItem(item('a', 'banner', 72, 36, 100))).toBe(true);
    expect(isQualifyingLargeBannerDiscountItem(item('a', 'banner', 36, 72, 100))).toBe(true);
    expect(isQualifyingLargeBannerDiscountItem(item('a', 'banner', 108, 24, 100))).toBe(false);
    expect(isQualifyingLargeBannerDiscountItem(item('a', 'banner', 48, 48, 100))).toBe(false);
    expect(isQualifyingLargeBannerDiscountItem(item('a', undefined, 72, 36, 100))).toBe(false);
    expect(isQualifyingLargeBannerDiscountItem(item('a', 'yard_sign', 72, 36, 100))).toBe(false);
  });

  it('discounts only original qualifying banner IDs and respects the original cap', () => {
    const items = [
      item('large', 'banner', 96, 48, 20000),
      item('small', 'banner', 48, 24, 4000),
      item('yard', 'yard_sign', 72, 36, 12000),
      item('added', 'car_magnet', 96, 48, 16000),
    ];
    const promo = scopedOffer();
    const promoSubtotalCents = getPromoDiscountSubtotalCents(items, 52000, promo);
    expect(promoSubtotalCents).toBe(20000);
    const resolved = resolveBestDiscount({
      subtotalCents: 52000,
      quantity: 2,
      quantitySubtotalCents: 24000,
      promoDiscount: promo,
      promoSubtotalCents,
    });
    expect(resolved.appliedDiscountType).toBe('promo');
    expect(resolved.appliedDiscountAmountCents).toBe(2500);
  });

  it('preserves generic full-order promotions and never stacks with quantity savings', () => {
    const generic = resolveBestDiscount({
      subtotalCents: 36000,
      quantity: 1,
      promoDiscount: { code: 'GENERIC25', discountPercentage: 25 },
    });
    expect(generic.appliedDiscountAmountCents).toBe(9000);

    const scoped = scopedOffer();
    const quantityWins = resolveBestDiscount({
      subtotalCents: 50000,
      quantity: 5,
      quantitySubtotalCents: 50000,
      promoDiscount: scoped,
      promoSubtotalCents: 50000,
    });
    expect(quantityWins.appliedDiscountType).toBe('quantity');
    expect(quantityWins.appliedDiscountAmountCents).toBe(6500);
    expect(quantityWins.promoDiscountAmountCents).toBe(2500);
  });

  it('fails closed when scoped metadata or a qualifying original line is missing', () => {
    const large = item('large', 'banner', 72, 36, 10000);
    expect(getPromoDiscountSubtotalCents([large], 10000, scopedOffer({ eligibleCartItemIds: [] }))).toBe(0);
    expect(getPromoDiscountSubtotalCents([large], 10000, scopedOffer({ campaign: 'wrong' }))).toBe(0);
    expect(resolveBestDiscount({
      subtotalCents: 10000,
      quantity: 1,
      promoDiscount: scopedOffer(),
    }).appliedDiscountAmountCents).toBe(0);
  });
});
