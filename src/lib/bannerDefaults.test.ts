import { describe, expect, it } from 'vitest';
import { calculateBannerPricing } from './bannerPricingEngine';
import { isPopularBannerPreset, POPULAR_BANNER_PRESET } from './bannerDefaults';

describe('popular banner defaults', () => {
  it('defines the 6 by 3 preset as the selected banner default', () => {
    expect(POPULAR_BANNER_PRESET).toMatchObject({ widthIn: 72, heightIn: 36, presetIndex: 2 });
    expect(isPopularBannerPreset('banner', 72, 36, 2)).toBe(true);
    expect(calculateBannerPricing({
      widthIn: POPULAR_BANNER_PRESET.widthIn,
      heightIn: POPULAR_BANNER_PRESET.heightIn,
      quantity: 1,
      material: '13oz',
    }).subtotalBeforeDiscountCents).toBe(8100);
  });

  it('does not show the default note after the customer changes size or product', () => {
    expect(isPopularBannerPreset('banner', 96, 36, null)).toBe(false);
    expect(isPopularBannerPreset('yard_sign', 72, 36, 2)).toBe(false);
  });
});
