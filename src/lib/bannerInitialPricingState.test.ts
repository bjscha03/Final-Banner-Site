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
  it.each(pages)('$route keeps 6 × 3 highlighted without pricing it on first load', ({ source }) => {
    expect(source).toContain(
      "initialProductType === 'banner' ? POPULAR_BANNER_PRESET.presetIndex : null",
    );
    expect(source).toContain(
      'const [hasConfirmedSize, setHasConfirmedSize] = useState(false);',
    );
    expect(source).not.toContain(
      "const [hasConfirmedSize, setHasConfirmedSize] = useState(initialProductType === 'banner');",
    );
    expect(source).toContain(
      'const pricingWidthIn = hasCommittedBannerSize ? widthIn : 0;',
    );
    expect(source).toContain(
      'const pricingHeightIn = hasCommittedBannerSize ? heightIn : 0;',
    );
    expect(source).toContain('setHasConfirmedSize(true);');
  });

  it('labels the visible preset as a recommendation rather than a selection', () => {
    expect(POPULAR_BANNER_PRESET.mobilePriceNote).toBe('Most popular size: 6′ × 3′');
  });
});
