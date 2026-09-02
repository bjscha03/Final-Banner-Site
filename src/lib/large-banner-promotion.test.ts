import { describe, expect, it } from 'vitest';
import {
  getAutomaticLargeBannerSubtotalCents,
  isLargeBannerPromoEligible,
  isQualifyingLargeBannerDiscountItem,
  LARGE_BANNER_PERCENT_DISCOUNT_CONFLICT_MESSAGE,
  LARGE_BANNER_PROMO_ID,
  LARGE_BANNER_PROMO_LABEL,
  resolveBestDiscount,
  type PromoDiscountCartItem,
} from './discount-resolver';

const line = (
  id: string,
  widthIn: number,
  heightIn: number,
  lineTotalCents = 10_000,
  productType = 'banner',
): PromoDiscountCartItem => ({
  id,
  product_type: productType,
  width_in: widthIn,
  height_in: heightIn,
  line_total_cents: lineTotalCents,
});

describe('automatic LARGE_BANNER_25 eligibility', () => {
  it.each([
    ['4 × 2', 48, 24, false],
    ['6 × 2', 72, 24, false],
    ['5 × 4', 60, 48, false],
    ['9 × 2', 108, 24, false],
    ['6 × 3', 72, 36, true],
    ['3 × 6', 36, 72, true],
    ['7 × 3', 84, 36, true],
    ['8 × 3', 96, 36, true],
    ['6 × 4', 72, 48, true],
    ['8 × 4', 96, 48, true],
    ['10 × 4', 120, 48, true],
    ['71 in × 36 in', 71, 36, false],
    ['72 in × 35 in', 72, 35, false],
    ['72 in × 36 in', 72, 36, true],
    ['36 in × 72 in', 36, 72, true],
  ])('%s resolves to %s', (_label, widthIn, heightIn, expected) => {
    expect(isLargeBannerPromoEligible(widthIn, heightIn)).toBe(expected);
  });

  it('is dimension based rather than square-footage based', () => {
    expect(isLargeBannerPromoEligible(108, 24)).toBe(false);
    expect(isLargeBannerPromoEligible(48, 48)).toBe(false);
  });

  it('requires a true banner item and sums only qualifying lines', () => {
    const items = [
      line('large', 72, 36, 8_100),
      line('small', 72, 24, 5_400),
      line('yard', 72, 36, 14_000, 'yard_sign'),
      line('magnet', 96, 48, 16_000, 'car_magnet'),
    ];
    expect(isQualifyingLargeBannerDiscountItem(items[0])).toBe(true);
    expect(isQualifyingLargeBannerDiscountItem(items[2])).toBe(false);
    expect(getAutomaticLargeBannerSubtotalCents(items)).toBe(8_100);
  });
});

describe('automatic large-banner discount resolution', () => {
  it('applies 25% automatically without a promo code', () => {
    const resolved = resolveBestDiscount({
      subtotalCents: 8_100,
      quantity: 1,
      quantitySubtotalCents: 8_100,
      automaticPromotionSubtotalCents: 8_100,
    });

    expect(resolved.appliedDiscountType).toBe('promo');
    expect(resolved.appliedPromotionSource).toBe('automatic');
    expect(resolved.appliedPromotionId).toBe(LARGE_BANNER_PROMO_ID);
    expect(resolved.appliedDiscountLabel).toBe(LARGE_BANNER_PROMO_LABEL);
    expect(resolved.appliedDiscountAmountCents).toBe(2_025);
    expect(resolved.appliedDiscountRate).toBe(0.25);
  });

  it('does not apply automatically to 6 × 2 and allows a valid 20% code normally', () => {
    const resolved = resolveBestDiscount({
      subtotalCents: 5_400,
      quantity: 1,
      quantitySubtotalCents: 5_400,
      automaticPromotionSubtotalCents: 0,
      promoDiscount: { code: 'NEW20', discountPercentage: 20 },
      promoSubtotalCents: 5_400,
    });

    expect(resolved.appliedPromotionSource).toBe('promo_code');
    expect(resolved.appliedDiscountAmountCents).toBe(1_080);
    expect(resolved.appliedPromotionId).toBe('NEW20');
  });

  it('never stacks 20% on top of the automatic 25%', () => {
    const resolved = resolveBestDiscount({
      subtotalCents: 8_100,
      quantity: 1,
      quantitySubtotalCents: 8_100,
      automaticPromotionSubtotalCents: 8_100,
      promoDiscount: { code: 'NEW20', discountPercentage: 20 },
      promoSubtotalCents: 8_100,
    });

    expect(resolved.appliedPromotionSource).toBe('automatic');
    expect(resolved.appliedDiscountAmountCents).toBe(2_025);
    expect(resolved.manualPromoDiscountAmountCents).toBe(1_620);
    expect(resolved.helperMessage).toBe(LARGE_BANNER_PERCENT_DISCOUNT_CONFLICT_MESSAGE);
  });

  it('uses a genuinely better manual promotion once, without compounding', () => {
    const resolved = resolveBestDiscount({
      subtotalCents: 8_100,
      quantity: 1,
      quantitySubtotalCents: 8_100,
      automaticPromotionSubtotalCents: 8_100,
      promoDiscount: { code: 'CUSTOM60', discountPercentage: 60 },
      promoSubtotalCents: 8_100,
    });

    expect(resolved.appliedPromotionSource).toBe('promo_code');
    expect(resolved.appliedDiscountAmountCents).toBe(4_860);
    expect(resolved.automaticPromotionAmountCents).toBe(2_025);
  });

  it('compares quantity and promotion candidates and applies only the best one', () => {
    const resolved = resolveBestDiscount({
      subtotalCents: 40_500,
      quantity: 5,
      quantitySubtotalCents: 40_500,
      automaticPromotionSubtotalCents: 40_500,
    });

    expect(resolved.quantityDiscountAmountCents).toBe(5_265);
    expect(resolved.automaticPromotionAmountCents).toBe(10_125);
    expect(resolved.appliedDiscountAmountCents).toBe(10_125);
    expect(resolved.appliedPromotionSource).toBe('automatic');
  });

  it('can compare a lower rate across a larger mixed-cart base by actual savings', () => {
    const resolved = resolveBestDiscount({
      subtotalCents: 30_000,
      quantity: 2,
      quantitySubtotalCents: 30_000,
      automaticPromotionSubtotalCents: 8_100,
      promoDiscount: { code: 'ORDER20', discountPercentage: 20 },
      promoSubtotalCents: 30_000,
    });

    expect(resolved.automaticPromotionAmountCents).toBe(2_025);
    expect(resolved.manualPromoDiscountAmountCents).toBe(6_000);
    expect(resolved.appliedPromotionSource).toBe('promo_code');
    expect(resolved.appliedDiscountAmountCents).toBe(6_000);
  });
});
