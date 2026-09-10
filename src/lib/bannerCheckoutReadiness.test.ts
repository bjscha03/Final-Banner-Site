import { describe, expect, it } from 'vitest';
import { shouldAutoConfirmBannerSize } from './bannerCheckoutReadiness';

describe('banner checkout readiness', () => {
  it('treats artwork upload as confirmation of the visible valid banner size', () => {
    expect(shouldAutoConfirmBannerSize({
      productType: 'banner',
      widthIn: 48,
      heightIn: 24,
      hasArtwork: true,
    })).toBe(true);
  });

  it('preserves the initial uncommitted state before artwork is uploaded', () => {
    expect(shouldAutoConfirmBannerSize({
      productType: 'banner',
      widthIn: 48,
      heightIn: 24,
      hasArtwork: false,
    })).toBe(false);
  });

  it('never confirms missing or invalid dimensions', () => {
    expect(shouldAutoConfirmBannerSize({
      productType: 'banner',
      widthIn: 0,
      heightIn: 24,
      hasArtwork: true,
    })).toBe(false);
    expect(shouldAutoConfirmBannerSize({
      productType: 'banner',
      widthIn: Number.NaN,
      heightIn: 24,
      hasArtwork: true,
    })).toBe(false);
  });

  it('does not alter fixed-size product flows', () => {
    expect(shouldAutoConfirmBannerSize({
      productType: 'yard_sign',
      widthIn: 24,
      heightIn: 18,
      hasArtwork: true,
    })).toBe(false);
    expect(shouldAutoConfirmBannerSize({
      productType: 'car_magnet',
      widthIn: 18,
      heightIn: 12,
      hasArtwork: true,
    })).toBe(false);
  });
});
