import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { POPULAR_BANNER_PRESET } from './bannerDefaults';

const pages = [
  {
    route: '/design',
    source: readFileSync(fileURLToPath(new URL('../pages/Design.tsx', import.meta.url)), 'utf8'),
  },
  {
    route: '/google-ads-banner',
    source: readFileSync(fileURLToPath(new URL('../pages/GoogleAdsBanner.tsx', import.meta.url)), 'utf8'),
  },
];

describe('banner initial pricing state', () => {
  it.each(pages)('$route preselects and prices the 6 × 3 banner on first load', ({ source }) => {
    expect(source).toContain(
      "initialProductType === 'banner' ? POPULAR_BANNER_PRESET.presetIndex : null",
    );
    expect(source).toContain(
      "const [hasConfirmedSize, setHasConfirmedSize] = useState(initialProductType === 'banner');",
    );
    expect(source).not.toContain(
      'const [hasConfirmedSize, setHasConfirmedSize] = useState(false);',
    );
    expect(source).toContain(
      'const pricingWidthIn = hasCommittedBannerSize ? widthIn : 0;',
    );
    expect(source).toContain(
      'const pricingHeightIn = hasCommittedBannerSize ? heightIn : 0;',
    );
    expect(source).toContain('setHasConfirmedSize(true);');
    expect(source).toContain(') : bannerPromoActuallyApplied ? (');
  });

  it('labels the selected default as the most popular size', () => {
    expect(POPULAR_BANNER_PRESET.mobilePriceNote).toBe('Most popular size: 6′ × 3′');
  });
});
