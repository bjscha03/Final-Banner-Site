import { describe, expect, it } from 'vitest';
import { buildCheckoutIdentitySignature } from './PayPalCheckoutReliable';

const baseItem = {
  id: 'cart-line',
  product_type: 'banner',
  width_in: 120,
  height_in: 48,
  quantity: 1,
  line_total_cents: 10000,
  material: '13oz',
  file_key: 'customer-original',
  thumbnail_url: 'https://cdn.example.com/placement-a.jpg',
  web_preview_url: 'https://cdn.example.com/placement-a.jpg',
  artwork_manifest: {
    publicId: 'customer-original',
    version: 7,
    originalUrl: 'https://cdn.example.com/customer-original.png',
  },
  placement_preview: {
    sourceIdentity: 'customer-original@7@1',
    compositionSignature: 'placement-v3-a',
    compositionRevision: 4,
    previewUrl: 'https://cdn.example.com/placement-a.jpg',
    previewPublicId: 'placement-a',
  },
};

const signature = (item: any) => buildCheckoutIdentitySignature({
  total: 10600,
  discountCode: null,
  sameDayHitService: false,
  saturdayDelivery: false,
  items: [item],
});

describe('PayPal checkout artwork identity', () => {
  it('changes when the exact placement changes without a price change', () => {
    const changed = {
      ...baseItem,
      thumbnail_url: 'https://cdn.example.com/placement-b.jpg',
      web_preview_url: 'https://cdn.example.com/placement-b.jpg',
      placement_preview: {
        ...baseItem.placement_preview,
        compositionSignature: 'placement-v3-b',
        compositionRevision: 5,
        previewUrl: 'https://cdn.example.com/placement-b.jpg',
        previewPublicId: 'placement-b',
      },
    };

    expect(signature(changed)).not.toBe(signature(baseItem));
  });

  it('changes when immutable original artwork identity changes', () => {
    const changed = {
      ...baseItem,
      file_key: 'replacement-original',
      artwork_manifest: {
        ...baseItem.artwork_manifest,
        publicId: 'replacement-original',
        version: 8,
      },
      placement_preview: {
        ...baseItem.placement_preview,
        sourceIdentity: 'replacement-original@8@1',
      },
    };

    expect(signature(changed)).not.toBe(signature(baseItem));
  });

  it('is deterministic for equivalent checkout input', () => {
    expect(signature(structuredClone(baseItem))).toBe(signature(baseItem));
  });
});
