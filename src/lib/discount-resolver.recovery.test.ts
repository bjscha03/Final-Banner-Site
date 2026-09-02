import { describe, expect, it } from 'vitest';
import {
  getAutomaticLargeBannerSubtotalCents,
  getPromoDiscountSubtotalCents,
  isQualifyingLargeBannerDiscountItem,
  LARGE_BANNER_PROMO_ID,
  LARGE_BANNER_PROMO_LABEL,
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_SCOPE,
  SEPTEMBER_LARGE_BANNER_CAMPAIGN,
  SEPTEMBER_LARGE_BANNER_SCOPE,
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

  it('treats old recovery 25% codes as redundant with the automatic promotion', () => {
    const items = [
      item('large', 'banner', 96, 48, 20000),
      item('small', 'banner', 48, 24, 4000),
      item('yard', 'yard_sign', 72, 36, 12000),
      item('added', 'banner', 72, 36, 8000),
    ];
    const promo = scopedOffer();
    const automaticSubtotalCents = getAutomaticLargeBannerSubtotalCents(items);
    expect(automaticSubtotalCents).toBe(28000);
    expect(getPromoDiscountSubtotalCents(items, 44000, promo)).toBe(28000);

    const resolved = resolveBestDiscount({
      subtotalCents: 44000,
      quantity: 3,
      quantitySubtotalCents: 32000,
      promoDiscount: promo,
      promoSubtotalCents: 28000,
      automaticPromotionSubtotalCents: automaticSubtotalCents,
    });
    expect(resolved.appliedDiscountType).toBe('promo');
    expect(resolved.appliedPromotionSource).toBe('automatic');
    expect(resolved.appliedPromotionId).toBe(LARGE_BANNER_PROMO_ID);
    expect(resolved.appliedDiscountLabel).toBe(LARGE_BANNER_PROMO_LABEL);
    expect(resolved.appliedDiscountAmountCents).toBe(7000);
  });

  it('preserves generic full-order promotions and never stacks with automatic or quantity savings', () => {
    const generic = resolveBestDiscount({
      subtotalCents: 36000,
      quantity: 1,
      automaticPromotionSubtotalCents: 20000,
      promoDiscount: { code: 'GENERIC25', discountPercentage: 25 },
      promoSubtotalCents: 36000,
    });
    expect(generic.appliedPromotionSource).toBe('promo_code');
    expect(generic.appliedDiscountAmountCents).toBe(9000);
    expect(generic.automaticPromotionAmountCents).toBe(5000);

    const automaticWins = resolveBestDiscount({
      subtotalCents: 50000,
      quantity: 5,
      quantitySubtotalCents: 50000,
      automaticPromotionSubtotalCents: 50000,
    });
    expect(automaticWins.appliedPromotionSource).toBe('automatic');
    expect(automaticWins.appliedDiscountAmountCents).toBe(12500);
    expect(automaticWins.quantityDiscountAmountCents).toBe(6500);
  });

  it('does not manufacture eligibility from a legacy code when the cart has no qualifying banner', () => {
    const small = item('small', 'banner', 72, 24, 10000);
    const promo = scopedOffer();
    expect(getAutomaticLargeBannerSubtotalCents([small])).toBe(0);
    expect(getPromoDiscountSubtotalCents([small], 10000, promo)).toBe(0);
    expect(resolveBestDiscount({
      subtotalCents: 10000,
      quantity: 1,
      promoDiscount: promo,
      promoSubtotalCents: 0,
      automaticPromotionSubtotalCents: 0,
    }).appliedDiscountAmountCents).toBe(0);
  });

  it('maps the retired BIG25 campaign metadata to the same automatic promotion', () => {
    const items = [
      item('landscape', 'banner', 72, 36, 10000),
      item('portrait', 'banner', 36, 72, 8000),
      item('larger', 'banner', 96, 48, 16000),
      item('small', 'banner', 48, 24, 4000),
      item('yard', 'yard_sign', 72, 36, 12000),
    ];
    const promo: PromoDiscountInput = {
      code: 'BIG25',
      discountPercentage: 25,
      campaign: SEPTEMBER_LARGE_BANNER_CAMPAIGN,
      discountScope: SEPTEMBER_LARGE_BANNER_SCOPE,
    };
    const automaticSubtotalCents = getAutomaticLargeBannerSubtotalCents(items);
    expect(automaticSubtotalCents).toBe(34000);
    const resolved = resolveBestDiscount({
      subtotalCents: 50000,
      quantity: 4,
      quantitySubtotalCents: 38000,
      promoDiscount: promo,
      promoSubtotalCents: getPromoDiscountSubtotalCents(items, 50000, promo),
      automaticPromotionSubtotalCents: automaticSubtotalCents,
    });
    expect(resolved.appliedPromotionSource).toBe('automatic');
    expect(resolved.appliedDiscountAmountCents).toBe(8500);
    expect(resolved.quantityDiscountAmountCents).toBe(3800);
  });
});
