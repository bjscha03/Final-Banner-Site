import { describe, expect, it } from 'vitest';
import {
  ADMIN_THUMBNAIL_CLOUDINARY_CLOUD,
  getFinalizedThumbnailCandidates,
  getFinalizedThumbnailUrl,
} from './order-thumbnail';

describe('order thumbnail selection', () => {
  it('builds a mobile-safe Cloudinary derivative and retains the original fallback', () => {
    const original = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/order-art.png';
    const candidates = getFinalizedThumbnailCandidates({ thumbnail_url: original }, 180);

    expect(candidates).toEqual([
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:good,w_800,c_limit/v123/uploads/order-art.png',
      original,
    ]);
    expect(getFinalizedThumbnailUrl({ thumbnail_url: original }, 180)).toBe(candidates[0]);
  });

  it('never returns a raw PDF to an image element', () => {
    expect(getFinalizedThumbnailCandidates({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v123/uploads/order-art.pdf',
    })).toEqual([]);
    expect(getFinalizedThumbnailUrl({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v123/uploads/order-art.pdf',
    })).toBeNull();
  });

  it('keeps an external image as a fallback behind the Cloudinary fetch derivative', () => {
    const original = 'https://cdn.example.com/order-art.jpg';
    expect(getFinalizedThumbnailCandidates({ final_render_url: original }, 320)).toEqual([
      `https://res.cloudinary.com/${ADMIN_THUMBNAIL_CLOUDINARY_CLOUD}/image/fetch/w_320,c_limit,f_auto,q_auto/${original}`,
      original,
    ]);
  });

  it('preserves immediate data thumbnails for post-checkout rendering', () => {
    const dataUrl = 'data:image/jpeg;base64,temporary';
    expect(getFinalizedThumbnailCandidates({ thumbnail_url: dataUrl })).toEqual([dataUrl]);
  });
});
