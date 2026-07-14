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

  it('does not let a temporary data URL hide a permanent web preview', () => {
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

  it('uses the permanent web preview for the enlarged view', () => {
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
