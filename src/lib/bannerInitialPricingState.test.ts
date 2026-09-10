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
  it.each(pages)('$route starts with no preset selected and is unpriced on first load', ({ source }) => {
    // Fresh load must NOT preselect any preset (including the 6×3 popular one).
    expect(source).toContain(
      'const [activePreset, setActivePreset] = useState<number | null>(null);',
    );
    expect(source).not.toContain(
      "initialProductType === 'banner' ? POPULAR_BANNER_PRESET.presetIndex : null",
    );
    // Fresh load must NOT auto-confirm a size, so pricing stays at $0 until
    // the customer clicks a preset or confirms/changes a custom size.
    expect(source).toContain(
      'const [hasConfirmedSize, setHasConfirmedSize] = useState(false);',
    );
    expect(source).not.toContain(
      "const [hasConfirmedSize, setHasConfirmedSize] = useState(initialProductType === 'banner');",
    );
    // The pricing guard itself must remain in place — it's what makes an
    // unconfirmed size price at $0.
    expect(source).toContain(
      'const pricingWidthIn = hasCommittedBannerSize ? widthIn : 0;',
    );
    expect(source).toContain(
      'const pricingHeightIn = hasCommittedBannerSize ? heightIn : 0;',
    );
    // Clicking a preset must still confirm the size (and thus enable pricing).
    expect(source).toContain('setHasConfirmedSize(true);');
    expect(source).toContain(') : bannerPromoActuallyApplied ? (');
  });

  it('labels the selected default as the most popular size', () => {
    expect(POPULAR_BANNER_PRESET.mobilePriceNote).toBe('Most popular size: 6′ × 3′');
  });
});
