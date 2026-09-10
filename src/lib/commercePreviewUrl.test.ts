import { describe, expect, it } from 'vitest';
import { buildCommercePreviewUrl } from './commercePreviewUrl';

describe('buildCommercePreviewUrl', () => {
  it('requests a compact Cloudinary derivative instead of the full original image', () => {
    expect(buildCommercePreviewUrl(
      'https://res.cloudinary.com/demo/image/upload/v123/uploads/large-artwork.png',
      200,
    )).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:good,w_800,c_limit/v123/uploads/large-artwork.png',
    );
  });

  it('creates a first-page JPG derivative for image-type Cloudinary PDFs', () => {
    expect(buildCommercePreviewUrl(
      'https://res.cloudinary.com/demo/image/upload/v123/uploads/artwork.pdf',
      820,
    )).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1640,c_limit/v123/uploads/artwork.jpg',
    );
  });

  it('does not stack another transformation onto an existing derivative', () => {
    const transformed = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:good,w_1200,c_limit/v123/uploads/artwork.png';
    expect(buildCommercePreviewUrl(transformed, 200)).toBe(transformed);
  });

  it('keeps immediate browser thumbnails available during background processing', () => {
    const dataUrl = 'data:image/jpeg;base64,temporary';
    expect(buildCommercePreviewUrl(dataUrl, 200)).toBe(dataUrl);
  });

  it('rejects raw PDF URLs that cannot render in an image element', () => {
    expect(buildCommercePreviewUrl(
      'https://res.cloudinary.com/demo/raw/upload/v123/uploads/artwork.pdf',
      200,
    )).toBeNull();
  });
});
