import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/store/cart';
import { buildCartArtworkForEditor, getPermanentArtworkPreviewUrl } from './cartArtworkForEditor';
import { resolveArtworkPreviewImageSrc } from '@/components/design/artworkPreviewSource';

const original = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/banner.pdf';
const legacyPreview = original.replace('/upload/', '/upload/pg_1,f_jpg,w_800/');
const savedPng = 'https://res.cloudinary.com/demo/image/upload/v123/uploads/pdf-page.png';

function pdfCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'pdf-return', product_type: 'banner', width_in: 120, height_in: 48,
    is_pdf: true, file_url: original, file_key: 'uploads/banner', file_name: 'banner.pdf',
    placement_preview: {
      sourceUrl: legacyPreview,
      previewUrl: 'https://res.cloudinary.com/demo/image/upload/baked-placement.png',
      uploadStatus: 'uploaded', compositionRevision: 4,
    },
    ...overrides,
  } as CartItem;
}

describe('PDF cart return to designer', () => {
  it('restores the original-page image instead of rejecting a legacy transformed PDF URL', () => {
    const restored = buildCartArtworkForEditor(pdfCartItem())!;
    expect(restored.previewUrl).toBe(legacyPreview.replace('.pdf', '.jpg'));
    expect(resolveArtworkPreviewImageSrc({ ...restored, src: restored.url })).toBe(restored.previewUrl);
    expect(restored.productionUrl).toBe(original);
    expect(restored.url).toBe(original);
  });

  it('keeps the separately stored PNG source for a large PDF', () => {
    const largeOriginal = 'https://bannersonthefly.com/artwork-original/123/original.pdf';
    const restored = buildCartArtworkForEditor(pdfCartItem({
      file_url: largeOriginal,
      placement_preview: { sourceUrl: savedPng, previewUrl: 'https://cdn.test/baked.png', uploadStatus: 'uploaded' },
    }))!;
    expect(restored.previewUrl).toBe(savedPng);
    expect(restored.productionUrl).toBe(largeOriginal);
    expect(restored.url).toBe(largeOriginal);
  });

  it('regenerates a Cloudinary first-page URL if an old cart lacks its source preview', () => {
    const restored = buildCartArtworkForEditor(pdfCartItem({ placement_preview: undefined }))!;
    expect(restored.previewUrl).toContain('pg_1,f_jpg');
    expect(restored.previewUrl).toMatch(/\.jpg$/);
    expect(restored.productionUrl).toBe(original);
  });

  it('preserves the saved source for checkout after a local retry replaces the displayed image', () => {
    const restored = buildCartArtworkForEditor(pdfCartItem({
      file_url: 'https://bannersonthefly.com/artwork-original/123/original.pdf',
      placement_preview: { sourceUrl: savedPng, uploadStatus: 'uploaded' },
    }))!;
    restored.previewUrl = restored.thumbnailUrl = 'blob:https://site.test/regenerated';
    expect(getPermanentArtworkPreviewUrl(restored)).toBe(savedPng);
    expect(restored.productionUrl).toMatch(/original\.pdf$/);
  });

  it.each(['blob:https://site.test/expired', 'data:image/png;base64,expired', 'https://cdn.test/original.pdf?download=1'])(
    'does not restore an unusable saved source: %s', sourceUrl => {
      const restored = buildCartArtworkForEditor(pdfCartItem({
        placement_preview: { sourceUrl, uploadStatus: 'uploaded' },
      }))!;
      expect(restored.previewUrl).toContain('pg_1,f_jpg');
      expect(restored.previewUrl).toMatch(/\.jpg$/);
    },
  );
});
