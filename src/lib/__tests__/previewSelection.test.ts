import { describe, expect, it } from 'vitest';
import {
  getExpandedPreviewSelection,
  getSmallPreviewSelection,
  getSmallPreviewUrl,
} from '../previewSelection';

describe('previewSelection identity contract', () => {
  it('keeps compact and expanded previews on the same positioned snapshot', () => {
    const item = {
      placement_preview: { url: 'https://cdn.example.com/placement.png' },
      final_render_url: 'https://cdn.example.com/final.png',
      web_preview_url: 'https://cdn.example.com/web.png',
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      file_url: 'https://cdn.example.com/original.png',
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/placement.png',
      isExactComposition: true,
    });
    expect(getExpandedPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/placement.png',
      isExactComposition: true,
    });
  });

  it('keeps the 120 by 48 positioned data snapshot ahead of a generic original', () => {
    const positioned = 'data:image/jpeg;base64,wide-banner-positioned';
    const item = {
      width_in: 120,
      height_in: 48,
      thumbnail_url: positioned,
      file_url: 'https://cdn.example.com/original-with-white-artboard.png',
      image_position: { x: 14, y: -5 },
      image_scale: 1.6,
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: positioned,
      source: 'thumbnail_fallback',
      isExactComposition: true,
      isLowResolutionFallback: true,
    });
    expect(getExpandedPreviewSelection(item).url).toBe(positioned);
  });

  it('never sends a raw PDF URL to an img element when a permanent image proof exists', () => {
    expect(getSmallPreviewUrl({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
      web_preview_url: 'https://cdn.example.com/web-preview.png',
    })).toBe('https://cdn.example.com/web-preview.png');
  });

  it('returns no image when the only candidate is an unpreviewable raw PDF', () => {
    expect(getSmallPreviewUrl({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
    })).toBeNull();
  });

  it('recovers an image item from file_key after navigation or refresh as an original fallback', () => {
    const item = {
      file_key: 'uploads/customer_image_123',
      file_name: 'customer-image.jpeg',
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: 'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer_image_123.jpeg',
      source: 'original_fallback',
      isExactComposition: false,
    });
    expect(getExpandedPreviewSelection(item).url).toBe(
      'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer_image_123.jpeg',
    );
  });

  it('keeps the first Yard Sign design stable instead of switching to an item-level image', () => {
    const item = {
      product_type: 'yard_sign',
      yard_sign_designs: [
        {
          previewThumbnailUrl: 'https://cdn.example.com/yard-one-positioned.jpg',
          fileUrl: 'https://cdn.example.com/yard-one-original.jpg',
        },
        {
          previewThumbnailUrl: 'https://cdn.example.com/yard-two-positioned.jpg',
          fileUrl: 'https://cdn.example.com/yard-two-original.jpg',
        },
      ],
      thumbnail_url: 'https://cdn.example.com/item-level.jpg',
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/yard-one-positioned.jpg',
      isExactComposition: true,
    });
    expect(getExpandedPreviewSelection(item).url).toBe('https://cdn.example.com/yard-one-positioned.jpg');
  });

  it('labels a temporary data URL as an exact low-resolution in-session fallback', () => {
    const selected = getExpandedPreviewSelection({
      thumbnail_url: 'data:image/png;base64,small',
    });

    expect(selected.url).toBe('data:image/png;base64,small');
    expect(selected.source).toBe('thumbnail_fallback');
    expect(selected.isLowResolutionFallback).toBe(true);
    expect(selected.isExactComposition).toBe(true);
  });
});
