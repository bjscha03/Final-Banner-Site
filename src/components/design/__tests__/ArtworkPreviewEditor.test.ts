import { describe, expect, it } from 'vitest';
import { isRawPdfPreviewSource, resolveArtworkPreviewImageSrc } from '../artworkPreviewSource';

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
});
