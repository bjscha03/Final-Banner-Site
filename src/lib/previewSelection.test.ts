import { describe, expect, it } from 'vitest';
import {
  buildCloudinaryPdfPreviewUrl,
  getExpandedPreviewSelection,
  getSmallPreviewUrl,
} from './previewSelection';

describe('previewSelection', () => {
  it('prefers a permanent thumbnail over other permanent fallbacks', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'https://cdn.example.com/approved-thumbnail.jpg',
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
      file_url: 'https://cdn.example.com/original.png',
    })).toBe('https://cdn.example.com/approved-thumbnail.jpg');
  });

  it('does not let a temporary data URL hide a permanent legacy web preview', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'data:image/jpeg;base64,temporary',
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
    })).toBe('https://cdn.example.com/web-preview.jpg');
  });

  it('falls back to the temporary data thumbnail while permanent processing finishes', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'data:image/jpeg;base64,temporary',
    })).toBe('data:image/jpeg;base64,temporary');
  });

  it('ignores blob URLs because they cannot survive navigation or another device', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'blob:https://bannersonthefly.com/temporary',
      file_url: 'https://cdn.example.com/original.jpg',
    })).toBe('https://cdn.example.com/original.jpg');
  });

  it('creates a browser-safe first-page image URL for Cloudinary PDFs', () => {
    const source = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/design.pdf';
    expect(buildCloudinaryPdfPreviewUrl(source)).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/v123/uploads/design.jpg',
    );
  });

  it('uses the permanent legacy web preview for an enlarged pre-manifest item', () => {
    expect(getExpandedPreviewSelection({
      thumbnail_url: 'data:image/jpeg;base64,temporary',
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
    })).toEqual({
      url: 'https://cdn.example.com/web-preview.jpg',
      source: 'web_preview',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    });
  });

  it('uses only an uploaded placement preview when a placement manifest exists', () => {
    expect(getExpandedPreviewSelection({
      product_type: 'banner',
      thumbnail_url: 'https://cdn.example.com/current-thumbnail.jpg',
      web_preview_url: 'https://cdn.example.com/stale-preview.jpg',
      placement_preview: { uploadStatus: 'pending' },
    }).url).toBe('https://cdn.example.com/current-thumbnail.jpg');

    expect(getExpandedPreviewSelection({
      product_type: 'banner',
      thumbnail_url: 'https://cdn.example.com/current-thumbnail.jpg',
      web_preview_url: 'https://cdn.example.com/stale-preview.jpg',
      placement_preview: {
        uploadStatus: 'uploaded',
        url: 'https://cdn.example.com/current-placement.jpg',
      },
    }).url).toBe('https://cdn.example.com/current-placement.jpg');
  });

  it('never lets a stale item-level web preview replace the yard sign artwork', () => {
    const selection = getExpandedPreviewSelection({
      product_type: 'yard_sign',
      thumbnail_url: 'https://cdn.example.com/current-yard-sign-thumbnail.jpg',
      web_preview_url: 'https://cdn.example.com/previous-banner-preview.jpg',
      yard_sign_designs: [{
        previewThumbnailUrl: 'https://cdn.example.com/current-yard-sign-proof.jpg',
        fileUrl: 'https://cdn.example.com/current-yard-sign-original.jpg',
      }],
    });

    expect(selection.url).toBe('https://cdn.example.com/current-yard-sign-thumbnail.jpg');
    expect(selection.url).not.toContain('previous-banner');
  });

  it('uses a permanent yard sign design proof when its immediate thumbnail is temporary', () => {
    expect(getExpandedPreviewSelection({
      product_type: 'yard_sign',
      thumbnail_url: 'data:image/png;base64,temporary-yard-sign',
      web_preview_url: 'https://cdn.example.com/stale-preview.jpg',
      yard_sign_designs: [{
        previewThumbnailUrl: 'https://cdn.example.com/current-yard-sign-proof.jpg',
      }],
    }).url).toBe('https://cdn.example.com/current-yard-sign-proof.jpg');
  });

  it('marks a temporary thumbnail as a low-resolution processing fallback', () => {
    expect(getExpandedPreviewSelection({
      thumbnail_url: 'data:image/jpeg;base64,temporary',
    })).toEqual({
      url: 'data:image/jpeg;base64,temporary',
      source: 'thumbnail_fallback',
      isLowResolutionFallback: true,
      isPreparingHighResolution: true,
    });
  });
});
