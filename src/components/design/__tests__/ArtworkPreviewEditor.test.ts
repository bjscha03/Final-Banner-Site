import { describe, expect, it } from 'vitest';
import { getPreviewCrossOrigin, isRawPdfPreviewSource, resolveArtworkPreviewImageSrc } from '../artworkPreviewSource';

describe('ArtworkPreviewEditor preview source resolution', () => {
  it('rejects raw Cloudinary PDF URLs as image sources', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/example/raw/upload/test.pdf',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    })).toBe('');
    expect(isRawPdfPreviewSource('https://res.cloudinary.com/example/raw/upload/test.pdf')).toBe(true);
  });

  it('allows a real PNG preview even when the production source is a raw PDF', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/example/raw/upload/test.pdf',
      previewUrl: 'data:image/png;base64,actual-pdf-page',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    })).toBe('data:image/png;base64,actual-pdf-page');
  });

  it('gives previewUrl priority over productionUrl-like src values', () => {
    expect(resolveArtworkPreviewImageSrc({
      src: 'https://res.cloudinary.com/example/raw/upload/test.pdf',
      previewUrl: 'blob:https://preview.local/rendered-page',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    })).toBe('blob:https://preview.local/rendered-page');
  });

  it('does not apply crossOrigin to blob or data previews', () => {
    expect(getPreviewCrossOrigin('blob:https://preview.local/page', 'anonymous')).toBeUndefined();
    expect(getPreviewCrossOrigin('data:image/png;base64,page', 'anonymous')).toBeUndefined();
    expect(getPreviewCrossOrigin('https://cdn.example.com/page.png', 'anonymous')).toBe('anonymous');
  });
});
