import { describe, expect, it } from 'vitest';
import {
  buildCloudinaryPdfPreviewUrl,
  buildCloudinaryUrlFromFileKey,
  getExpandedPreviewSelection,
  getPreviewSourceCandidates,
  getSmallPreviewSelection,
  getSmallPreviewUrl,
} from './previewSelection';

describe('previewSelection', () => {
  it('uses the same exact placement identity for the small and expanded preview', () => {
    const item = {
      placement_preview: { url: 'https://cdn.example.com/approved-thumbnail.jpg' },
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
      file_url: 'https://cdn.example.com/original.png',
    };

    expect(getSmallPreviewUrl(item)).toBe('https://cdn.example.com/approved-thumbnail.jpg');
    expect(getExpandedPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/approved-thumbnail.jpg',
      source: 'placement_preview',
      isLowResolutionFallback: false,
      isExactComposition: true,
    });
  });

  it('does not let a temporary data URL hide a permanent exact web preview', () => {
    const item = {
      thumbnail_url: 'data:image/jpeg;base64,temporary',
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/web-preview.jpg',
      source: 'web_preview',
      isExactComposition: true,
    });
    expect(getExpandedPreviewSelection(item).url).toBe('https://cdn.example.com/web-preview.jpg');
  });

  it('keeps an immediate positioned snapshot ahead of a generic permanent original', () => {
    const positioned = 'data:image/jpeg;base64,exact-120x48-positioned-snapshot';
    const original = 'https://cdn.example.com/original-artboard-with-large-white-margin.png';
    const item = {
      thumbnail_url: positioned,
      file_url: original,
      width_in: 120,
      height_in: 48,
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: positioned,
      source: 'thumbnail_fallback',
      isLowResolutionFallback: true,
      isExactComposition: true,
    });
    expect(getExpandedPreviewSelection(item)).toMatchObject({
      url: positioned,
      isExactComposition: true,
    });
    expect(getPreviewSourceCandidates(item).slice(0, 2)).toEqual([
      positioned,
      original,
    ]);
  });

  it('does not call an original URL exact merely because it is also stored as thumbnail_url', () => {
    const original = 'https://cdn.example.com/customer-original.png';
    expect(getSmallPreviewSelection({
      thumbnail_url: original,
      file_url: original,
    })).toMatchObject({
      url: original,
      isExactComposition: false,
    });
  });

  it('uses a temporary data thumbnail when it is the only source', () => {
    expect(getSmallPreviewSelection({
      thumbnail_url: 'data:image/jpeg;base64,temporary',
    })).toMatchObject({
      url: 'data:image/jpeg;base64,temporary',
      isExactComposition: true,
      isLowResolutionFallback: true,
    });
  });

  it('keeps blob URLs behind permanent sources and reconstructs missing Cloudinary URLs', () => {
    const item = {
      thumbnail_url: 'blob:https://bannersonthefly.com/temporary',
      file_key: 'uploads/customer-artwork_ab12cd',
      file_name: 'customer-artwork.jpg',
    };

    expect(getSmallPreviewUrl(item)).toBe(
      'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer-artwork_ab12cd.jpg',
    );
  });

  it('reconstructs a Cloudinary delivery URL from an upload public ID', () => {
    expect(buildCloudinaryUrlFromFileKey('uploads/design_abc123', {
      format: 'png',
    })).toBe(
      'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/design_abc123.png',
    );
  });

  it('creates a browser-safe first-page image URL for Cloudinary PDFs', () => {
    const source = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/design.pdf';
    expect(buildCloudinaryPdfPreviewUrl(source)).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1800,c_limit/v123/uploads/design.jpg',
    );
  });

  it('uses the exact nested Yard Sign preview for both thumbnail and lightbox', () => {
    const item = {
      product_type: 'yard_sign',
      yard_sign_designs: [{
        previewThumbnailUrl: 'https://cdn.example.com/yard-sign-positioned.jpg',
        thumbnailUrl: 'https://cdn.example.com/yard-sign-thumb.jpg',
        fileUrl: 'https://cdn.example.com/yard-sign-original.png',
      }],
      thumbnail_url: 'https://cdn.example.com/unrelated-item-thumb.jpg',
    };

    expect(getSmallPreviewUrl(item)).toBe('https://cdn.example.com/yard-sign-positioned.jpg');
    expect(getExpandedPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/yard-sign-positioned.jpg',
      source: 'yard_sign_preview',
      isExactComposition: true,
    });
  });

  it('recovers from an artwork manifest when top-level preview fields are absent', () => {
    const item = {
      artwork_manifest: {
        originalUrl: 'https://res.cloudinary.com/demo/image/upload/v1/uploads/artwork.png',
        publicId: 'uploads/artwork',
        format: 'png',
        resourceType: 'image',
      },
    };

    expect(getSmallPreviewSelection(item)).toMatchObject({
      url: 'https://res.cloudinary.com/demo/image/upload/v1/uploads/artwork.png',
      source: 'original_fallback',
      isExactComposition: false,
    });
  });

  it('registers every usable representation as a renderer fallback', () => {
    expect(getPreviewSourceCandidates({
      placement_preview: { url: 'https://cdn.example.com/placement.jpg' },
      final_render_url: 'https://cdn.example.com/final.jpg',
      web_preview_url: 'https://cdn.example.com/web.jpg',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg',
      file_url: 'https://cdn.example.com/original.jpg',
    })).toEqual([
      'https://cdn.example.com/placement.jpg',
      'https://cdn.example.com/final.jpg',
      'https://cdn.example.com/web.jpg',
      'https://cdn.example.com/thumb.jpg',
      'https://cdn.example.com/original.jpg',
    ]);
  });

  it('does not return a raw Cloudinary PDF to an img element', () => {
    expect(getSmallPreviewUrl({
      artwork_manifest: {
        originalUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
        resourceType: 'raw',
      },
    })).toBeNull();
  });
});
