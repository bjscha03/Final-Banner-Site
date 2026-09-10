import { describe, expect, it } from 'vitest';
import { buildArtworkCompositionKey } from './artworkCompositionKey';

describe('artwork composition identity', () => {
  it('uses the permanent artwork identity and product type', () => {
    expect(buildArtworkCompositionKey({ productionPublicId: 'orders/art-123' }, 'banner'))
      .toBe('orders/art-123|banner');
  });

  it('keeps one identity while the canvas dimensions change outside the key', () => {
    const artwork = { editorIdentity: 'artwork-session-1', name: 'banner.png' };
    const beforeSizeChange = buildArtworkCompositionKey(artwork, 'banner');
    const afterSizeChange = buildArtworkCompositionKey(artwork, 'banner');

    expect(afterSizeChange).toBe(beforeSizeChange);
    expect(afterSizeChange).not.toMatch(/\d+x\d+$/);
  });

  it('still isolates the same file between different product canvases', () => {
    const artwork = { fileKey: 'upload-456' };
    expect(buildArtworkCompositionKey(artwork, 'banner'))
      .not.toBe(buildArtworkCompositionKey(artwork, 'car_magnet'));
  });
});
