import { describe, expect, it } from 'vitest';
import { calculateBannerPricing } from './bannerPricingEngine';
import { resolvePromo } from './promoEngine';
import { isPopularBannerPreset, POPULAR_BANNER_PRESET } from './bannerDefaults';

describe('popular banner defaults', () => {
  it('defines 6 by 3 as the selected default and resolves its automatic 25% price', () => {
    expect(POPULAR_BANNER_PRESET).toMatchObject({ widthIn: 72, heightIn: 36, presetIndex: 2 });
    expect(isPopularBannerPreset('banner', 72, 36, 2)).toBe(true);

    const pricing = calculateBannerPricing({
      widthIn: POPULAR_BANNER_PRESET.widthIn,
      heightIn: POPULAR_BANNER_PRESET.heightIn,
      quantity: 1,
      material: '13oz',
    });
    expect(pricing.subtotalBeforeDiscountCents).toBe(8100);

    const discount = resolvePromo({
      subtotalCents: pricing.subtotalBeforeDiscountCents,
      quantity: 1,
      items: [{
        id: 'default-6x3-banner',
        product_type: 'banner',
        width_in: POPULAR_BANNER_PRESET.widthIn,
        height_in: POPULAR_BANNER_PRESET.heightIn,
        line_total_cents: pricing.subtotalBeforeDiscountCents,
      }],
    });
    expect(discount).toMatchObject({
      promotionId: 'LARGE_BANNER_25',
      appliedDiscountType: 'promo',
      appliedDiscountAmountCents: 2025,
    });
    expect(pricing.subtotalBeforeDiscountCents - discount.appliedDiscountAmountCents).toBe(6075);
  });

  it('does not show the recommendation note after the customer changes size or product', () => {
    expect(isPopularBannerPreset('banner', 96, 36, null)).toBe(false);
    expect(isPopularBannerPreset('yard_sign', 72, 36, 2)).toBe(false);
  });
});
