import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BannerDiscountOffer from './BannerDiscountOffer';

describe('BannerDiscountOffer', () => {
  it('renders the offer headline, subline, and a copy control for 20OFF', () => {
    const html = renderToStaticMarkup(<BannerDiscountOffer />);
    expect(html).toContain('data-banner-discount-offer');
    expect(html).toContain('Up to 25% off');
    expect(html).toContain('&#x27; × 3&#x27; &amp; larger banners save automatically');
    expect(html).toContain('Smaller banners save 20% with code');
    expect(html).toContain('20OFF');
    expect(html).toContain('aria-label="Copy promo code 20OFF"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-live="polite"');
  });

  it('accepts a className for layout without changing the offer content', () => {
    const html = renderToStaticMarkup(<BannerDiscountOffer className="mt-5 w-full max-w-[505px]" />);
    expect(html).toContain('mt-5 w-full max-w-[505px]');
    expect(html).toContain('Up to 25% off');
  });
});

describe('Both banner heroes render the identical shared offer', () => {
  const designPageHeroSource = readFileSync(
    fileURLToPath(new URL('./DesignPageHero.tsx', import.meta.url)),
    'utf8',
  );
  const googleAdsSource = readFileSync(
    fileURLToPath(new URL('../../pages/GoogleAdsBanner.tsx', import.meta.url)),
    'utf8',
  );

  it('DesignPageHero imports and renders BannerDiscountOffer for the banner-only offer', () => {
    expect(designPageHeroSource).toContain(
      "import BannerDiscountOffer from '@/components/design/BannerDiscountOffer';",
    );
    expect(designPageHeroSource).toContain('<BannerDiscountOffer');
    // The offer flag is only set on the banner hero definition, never on
    // yard signs or car magnets.
    expect(designPageHeroSource).toContain('offer: true,');
  });

  it('GoogleAdsBanner (FastBannerAdHero) imports and renders BannerDiscountOffer', () => {
    expect(googleAdsSource).toContain(
      "import BannerDiscountOffer from '@/components/design/BannerDiscountOffer';",
    );
    expect(googleAdsSource).toContain('<BannerDiscountOffer');
    // The old hardcoded "25% off / Applied automatically" card must be gone —
    // it never mentioned the 20OFF code for smaller banners.
    expect(googleAdsSource).not.toContain('Applied automatically');
  });
});
