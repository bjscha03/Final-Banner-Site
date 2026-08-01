import { describe, expect, it } from 'vitest';
import {
  buildCloudinaryPdfPreviewUrl,
  getExpandedPreviewSelection,
  getSmallPreviewUrl,
} from '../previewSelection';

describe('previewSelection', () => {
  it('keeps small cart cards on thumbnail priority', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      web_preview_url: 'https://cdn.example.com/web.png',
      file_url: 'https://cdn.example.com/original.png',
    })).toBe('https://cdn.example.com/thumb.png');
  });

  it('never sends a raw PDF URL to an img element when a web preview exists', () => {
    expect(getSmallPreviewUrl({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
      web_preview_url: 'https://cdn.example.com/web-preview.png',
    })).toBe('https://cdn.example.com/web-preview.png');
  });

  it('returns no image when the only candidate is a legacy raw PDF', () => {
    expect(getSmallPreviewUrl({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
    })).toBeNull();
  });

  it('uses web_preview_url before final_render_url or thumbnail_url for expanded previews', () => {
    const selected = getExpandedPreviewSelection({
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      final_render_url: 'https://cdn.example.com/final.png',
      web_preview_url: 'https://cdn.example.com/web.png',
    });

    expect(selected.url).toBe('https://cdn.example.com/web.png');
    expect(selected.source).toBe('web_preview');
    expect(selected.isLowResolutionFallback).toBe(false);
  });

  it('labels thumbnail_url as a preparing low-resolution expanded fallback', () => {
    const selected = getExpandedPreviewSelection({
      thumbnail_url: 'data:image/png;base64,small',
    });

    expect(selected.url).toBe('data:image/png;base64,small');
    expect(selected.source).toBe('thumbnail_fallback');
    expect(selected.isLowResolutionFallback).toBe(true);
    expect(selected.isPreparingHighResolution).toBe(true);
  });

  it('derives a permanent first-page JPG from a Cloudinary image-type PDF', () => {
    const source = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/customer-art.pdf';
    expect(buildCloudinaryPdfPreviewUrl(source)).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/v123/uploads/customer-art.jpg',
    );
  });

  it('uses the permanent Cloudinary PDF page when no generated thumbnail exists', () => {
    const source = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/customer-art.pdf';
    expect(getSmallPreviewUrl({ file_url: source })).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/v123/uploads/customer-art.jpg',
    );

    const expanded = getExpandedPreviewSelection({ file_url: source });
    expect(expanded.url).toContain('/pg_1,f_jpg,q_auto:good,w_1600,c_limit/');
    expect(expanded.isPreparingHighResolution).toBe(false);
  });
});
