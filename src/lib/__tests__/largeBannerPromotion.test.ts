import { describe, expect, it } from 'vitest';
import {
  LARGE_BANNER_PROMOTION_ID,
  LARGE_BANNER_PROMOTION_LABEL,
  getPromoDiscountSubtotalCents,
  resolveBestDiscount,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
} from '../discount-resolver';
import { isQualifyingLargeBannerDimensions } from '../largeBannerPromotion';

const item = (
  id: string,
  widthIn: number,
  heightIn: number,
  lineTotalCents: number,
  productType = 'banner',
): PromoDiscountCartItem => ({
  id,
  product_type: productType,
  width_in: widthIn,
  height_in: heightIn,
  line_total_cents: lineTotalCents,
});

describe('automatic large-banner promotion', () => {
  it('qualifies 6×3 in either orientation and excludes 6×2 and non-banners', () => {
    expect(isQualifyingLargeBannerDimensions(72, 36, 'banner')).toBe(true);
    expect(isQualifyingLargeBannerDimensions(36, 72, 'banner')).toBe(true);
    expect(isQualifyingLargeBannerDimensions(72, 24, 'banner')).toBe(false);
    expect(isQualifyingLargeBannerDimensions(72, 36, 'yard_sign')).toBe(false);
  });

  it('automatically applies 25% with the exact promotion id and label', () => {
    const items = [item('large', 72, 36, 10_000)];
    const automaticSubtotal = getPromoDiscountSubtotalCents(items, 10_000, null);
    const resolved = resolveBestDiscount({
      subtotalCents: 10_000,
      quantity: 1,
      promoSubtotalCents: automaticSubtotal,
    });

    expect(resolved.appliedDiscountType).toBe('promo');
    expect(resolved.appliedDiscountAmountCents).toBe(2_500);
    expect(resolved.appliedDiscountRate).toBe(0.25);
    expect(resolved.promotionId).toBe(LARGE_BANNER_PROMOTION_ID);
    expect(resolved.promoDiscountCode).toBe(LARGE_BANNER_PROMOTION_ID);
    expect(resolved.appliedDiscountLabel).toBe(LARGE_BANNER_PROMOTION_LABEL);
  });

  it('does not discount a 6×2 banner', () => {
    const items = [item('small', 72, 24, 10_000)];
    const automaticSubtotal = getPromoDiscountSubtotalCents(items, 10_000, null);
    const resolved = resolveBestDiscount({
      subtotalCents: 10_000,
      quantity: 1,
      promoSubtotalCents: automaticSubtotal,
    });

    expect(automaticSubtotal).toBe(0);
    expect(resolved.appliedDiscountType).toBe('none');
    expect(resolved.appliedDiscountAmountCents).toBe(0);
  });

  it('discounts only qualifying lines in a mixed cart', () => {
    const items = [
      item('large', 96, 36, 12_000),
      item('small', 48, 24, 8_000),
      item('yard', 72, 36, 10_000, 'yard_sign'),
    ];
    const automaticSubtotal = getPromoDiscountSubtotalCents(items, 30_000, null);
    const resolved = resolveBestDiscount({
      subtotalCents: 30_000,
      quantity: 2,
      quantitySubtotalCents: 20_000,
      promoSubtotalCents: automaticSubtotal,
    });

    expect(automaticSubtotal).toBe(12_000);
    expect(resolved.appliedDiscountAmountCents).toBe(3_000);
    expect(resolved.appliedDiscountLabel).toBe(LARGE_BANNER_PROMOTION_LABEL);
  });

  it('never stacks the automatic offer with quantity savings', () => {
    const items = [item('large', 72, 36, 50_000)];
    const automaticSubtotal = getPromoDiscountSubtotalCents(items, 50_000, null);
    const resolved = resolveBestDiscount({
      subtotalCents: 50_000,
      quantity: 5,
      quantitySubtotalCents: 50_000,
      promoSubtotalCents: automaticSubtotal,
    });

    expect(resolved.quantityDiscountAmountCents).toBe(6_500);
    expect(resolved.appliedDiscountAmountCents).toBe(12_500);
    expect(resolved.appliedDiscountLabel).toBe(LARGE_BANNER_PROMOTION_LABEL);
  });

  it('does not let NEW20 replace or combine with the automatic 25% offer', () => {
    const items = [
      item('large', 72, 36, 10_000),
      item('small', 48, 24, 10_000),
    ];
    const new20: PromoDiscountInput = { code: 'NEW20', discountPercentage: 20 };
    const promoSubtotal = getPromoDiscountSubtotalCents(items, 20_000, new20);
    const resolved = resolveBestDiscount({
      subtotalCents: 20_000,
      quantity: 2,
      quantitySubtotalCents: 20_000,
      promoDiscount: new20,
      promoSubtotalCents: promoSubtotal,
    });

    expect(resolved.appliedDiscountAmountCents).toBe(2_500);
    expect(resolved.promoDiscountCode).toBe(LARGE_BANNER_PROMOTION_ID);
    expect(resolved.appliedDiscountLabel).toBe(LARGE_BANNER_PROMOTION_LABEL);
    expect(resolved.helperMessage).toMatch(/cannot be combined/i);
  });

  it('allows one genuinely larger promotion to replace, not stack with, the automatic offer', () => {
    const items = [item('large', 72, 36, 10_000)];
    const betterPromo: PromoDiscountInput = { code: 'VIP30', discountPercentage: 30 };
    const promoSubtotal = getPromoDiscountSubtotalCents(items, 10_000, betterPromo);
    const resolved = resolveBestDiscount({
      subtotalCents: 10_000,
      quantity: 1,
      promoDiscount: betterPromo,
      promoSubtotalCents: promoSubtotal,
    });

    expect(resolved.appliedDiscountAmountCents).toBe(3_000);
    expect(resolved.appliedDiscountLabel).toBe('VIP30 (30% off)');
    expect(resolved.automaticLargeBannerDiscountAmountCents).toBe(2_500);
  });
});
