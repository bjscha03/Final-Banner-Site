import { describe, expect, it } from 'vitest';
import {
  getPreviewCrossOrigin,
  isRawPdfPreviewSource,
  resolveArtworkPreviewImageSrc,
  shouldStartPreviewLoad,
} from '../artworkPreviewSource';
import { geometryFromNormalizedArtworkTransform } from '../ArtworkPreviewEditor';
import { restoreArtworkTransformFromGeometry } from '@/lib/artworkTransformGeometry';

describe('ArtworkPreviewEditor preview source resolution', () => {
  it('restores percentage placement independently of the current canvas pixels', () => {
    const geometry = geometryFromNormalizedArtworkTransform(
      { xPct: 12.5, yPct: -5, scaleX: 1.2, scaleY: 0.8 },
      { w: 400, h: 200 },
      { w: 1600, h: 800 },
    );

    expect(restoreArtworkTransformFromGeometry(
      geometry,
      { w: 800, h: 400 },
      { w: 1600, h: 800 },
      false,
    )).toEqual({ x: 100, y: -20, scaleX: 1.2, scaleY: 0.8 });
  });

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

  it('does not restart loading when only production metadata changes after a preview is loaded', () => {
    const previewUrl = 'blob:https://preview.local/rendered-page';

    expect(shouldStartPreviewLoad({
      imageSrc: previewUrl,
      rawPdfRejected: false,
      loadedPreviewSrc: '',
    })).toBe(true);

    // Regression guard for PR #354: productionUrl/resourceType/mimeType
    // updates must not reset loading when the actual preview URL is unchanged.
    expect(shouldStartPreviewLoad({
      imageSrc: previewUrl,
      rawPdfRejected: false,
      loadedPreviewSrc: previewUrl,
    })).toBe(false);
  });
});
