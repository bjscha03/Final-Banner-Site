import { describe, expect, it } from 'vitest';
import { normalizeOrderItemDisplay } from './product-display';
import { getFinalizedThumbnailCandidates } from './order-thumbnail';

describe('sitewide order preview surfaces', () => {
  it('keeps a multi-design Yard Sign on the same first design everywhere', () => {
    const firstDesign = 'https://cdn.example.com/yard-first-positioned.jpg';
    const item = {
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      quantity: 10,
      line_total_cents: 5000,
      yard_sign_designs: [
        {
          previewThumbnailUrl: firstDesign,
          thumbnailUrl: 'https://cdn.example.com/yard-first-thumb.jpg',
          fileUrl: 'https://cdn.example.com/yard-first-original.jpg',
        },
        {
          previewThumbnailUrl: 'https://cdn.example.com/yard-second-positioned.jpg',
          fileUrl: 'https://cdn.example.com/yard-second-original.jpg',
        },
      ],
      thumbnail_url: 'https://cdn.example.com/wrong-item-level.jpg',
    };

    const display = normalizeOrderItemDisplay(item);
    const candidates = getFinalizedThumbnailCandidates(item, 300);

    expect(display.thumbnailUrl).toBe(firstDesign);
    expect(display.finalizedPreviewUrl).toBe(firstDesign);
    expect(candidates[0]).toContain(encodeURIComponent(firstDesign));
    expect(candidates).toContain(firstDesign);
    expect(candidates.every((candidate) => !candidate.includes('yard-second-positioned'))).toBe(true);
  });

  it('recovers confirmation and Admin previews from a permanent Cloudinary file key', () => {
    const item = {
      product_type: 'banner',
      width_in: 48,
      height_in: 24,
      quantity: 1,
      line_total_cents: 3600,
      file_key: 'uploads/customer-artwork_abc123',
      file_name: 'customer-artwork.png',
    };

    const expected = 'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer-artwork_abc123.png';
    const display = normalizeOrderItemDisplay(item);
    const candidates = getFinalizedThumbnailCandidates(item, 300);

    expect(display.thumbnailUrl).toBe(expected);
    expect(display.finalizedPreviewUrl).toBe(expected);
    expect(candidates.some((candidate) => candidate.includes('customer-artwork_abc123.png'))).toBe(true);
  });

  it('uses the customer placement snapshot before generic originals', () => {
    const placement = 'https://cdn.example.com/magnet-positioned.jpg';
    const item = {
      product_type: 'car_magnet',
      width_in: 24,
      height_in: 12,
      quantity: 2,
      line_total_cents: 4000,
      placement_preview: { url: placement },
      final_render_url: 'https://cdn.example.com/magnet-final.jpg',
      file_url: 'https://cdn.example.com/magnet-original.jpg',
    };

    const display = normalizeOrderItemDisplay(item);
    const candidates = getFinalizedThumbnailCandidates(item, 300);

    expect(display.thumbnailUrl).toBe(placement);
    expect(display.finalizedPreviewUrl).toBe(placement);
    expect(candidates[0]).toContain(encodeURIComponent(placement));
    expect(candidates).toContain(placement);
    expect(candidates.findIndex((candidate) => candidate.includes('magnet-positioned')))
      .toBeLessThan(candidates.findIndex((candidate) => candidate.includes('magnet-original')));
  });
});
