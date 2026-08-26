import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BannerSizeUpsell from './BannerSizeUpsell';
import {
  calculateBannerSizeUpsellPriceDifferenceCents,
  getBannerAreaIncreasePercent,
  getBannerSizeUpsellState,
} from '@/lib/bannerSizeUpsell';

describe('BannerSizeUpsell', () => {
  it('renders the default 6 by 3 recommendation with the correct area and price increase', () => {
    const priceDifferenceCents = calculateBannerSizeUpsellPriceDifferenceCents({
      currentSubtotalAfterDiscountCents: 8100,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      addRope: false,
      ropePlacement: 'top',
      polePockets: 'none',
    });
    const html = renderToStaticMarkup(
      <BannerSizeUpsell
        widthIn={72}
        heightIn={36}
        priceDifferenceCents={priceDifferenceCents}
        onUpgrade={vi.fn()}
      />,
    );

    expect(priceDifferenceCents).toBe(6300);
    expect(getBannerAreaIncreasePercent(72, 36)).toBe(78);
    expect(html).toContain('data-upsell-state="offer"');
    expect(html).toContain('Make it easier to read from farther away');
    expect(html).toContain('BETTER LONG-DISTANCE VISIBILITY');
    expect(html).toContain('for 78% more print area.');
    expect(html).toContain('+$63');
    expect(html).toContain('data-testid="banner-size-upsell-button"');
  });

  it('uses the existing best-discount-wins pricing for an applied promotion', () => {
    const priceDifferenceCents = calculateBannerSizeUpsellPriceDifferenceCents({
      currentSubtotalAfterDiscountCents: 6480,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      addRope: false,
      ropePlacement: 'top',
      polePockets: 'none',
      promoCode: 'NEW20',
    });

    expect(priceDifferenceCents).toBe(5040);
  });

  it('renders a confirmation state after the recommended size is selected', () => {
    const html = renderToStaticMarkup(
      <BannerSizeUpsell
        widthIn={96}
        heightIn={48}
        priceDifferenceCents={0}
        onUpgrade={vi.fn()}
      />,
    );

    expect(getBannerSizeUpsellState(96, 48)).toBe('selected');
    expect(html).toContain('data-upsell-state="selected"');
    expect(html).toContain('banner is set for stronger visibility');
    expect(html).not.toContain('data-testid="banner-size-upsell-button"');
  });

  it('does not recommend a smaller target for banners already beyond 8 by 4', () => {
    const html = renderToStaticMarkup(
      <BannerSizeUpsell
        widthIn={120}
        heightIn={48}
        priceDifferenceCents={0}
        onUpgrade={vi.fn()}
      />,
    );

    expect(getBannerSizeUpsellState(120, 48)).toBe('hidden');
    expect(html).toBe('');
  });
});
