import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore, type CartItem } from './cart';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
  type ArtworkCompositionSpec,
} from '@/lib/previewLifecycle';

function readyPlacement() {
  const spec: ArtworkCompositionSpec = {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: 'edited-source@2@1',
    sourceUrl: 'https://cdn.example.com/edited-original.png',
    productType: 'banner',
    widthIn: 72,
    heightIn: 36,
    fitMode: 'fit',
    transform: { xPct: 5, yPct: -3, scaleX: 1.4, scaleY: 1.2 },
    revision: 5,
  };
  return {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: spec.sourceIdentity,
    sourceUrl: spec.sourceUrl,
    productType: spec.productType,
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    fitMode: spec.fitMode,
    positionPct: { x: spec.transform.xPct, y: spec.transform.yPct },
    scaleX: spec.transform.scaleX,
    scaleY: spec.transform.scaleY,
    compositionRevision: spec.revision,
    compositionSignature: buildCompositionSignature(spec),
    url: 'https://cdn.example.com/edited-placement.jpg',
    publicId: 'edited-placement',
    previewUrl: 'https://cdn.example.com/edited-placement.jpg',
    previewPublicId: 'edited-placement',
    previewWidthPx: 1400,
    previewHeightPx: 700,
    uploadStatus: 'uploaded' as const,
    createdAt: '2026-08-02T00:00:00.000Z',
    uploadedAt: '2026-08-02T00:00:00.000Z',
    error: null,
  };
}

const existingItem: CartItem = {
  id: 'cart-stable-id',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 8,
  unit_price_cents: 3600,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 3600,
  thumbnail_url: 'https://cdn.example.com/old-placement.jpg',
  web_preview_url: 'https://cdn.example.com/old-placement.jpg',
  created_at: '2026-08-01T00:00:00.000Z',
};

function editedQuote(placement = readyPlacement()) {
  return {
    product_type: 'banner',
    widthIn: 72,
    heightIn: 36,
    quantity: 2,
    material: '13oz',
    grommets: 'none',
    polePockets: 'none',
    polePocketSize: '2',
    addRope: false,
    ropePlacement: 'top',
    textElements: [],
    imageScale: 1.4,
    imageScaleY: 1.2,
    imagePosition: { x: 5, y: -3 },
    fitMode: 'fit',
    thumbnailUrl: placement.previewUrl,
    webPreviewUrl: placement.previewUrl,
    placementPreview: placement,
    artworkManifest: {
      originalUrl: placement.sourceUrl,
      publicId: 'edited-source',
      resourceType: 'image',
      format: 'png',
      mimeType: 'image/png',
      originalFilename: 'edited.png',
      bytes: 1024,
      uploadStatus: 'uploaded',
      uploadedAt: '2026-08-02T00:00:00.000Z',
    },
    file: {
      name: 'edited.png',
      url: placement.sourceUrl,
      productionUrl: placement.sourceUrl,
      fileKey: 'edited-source',
      size: 1024,
      isPdf: false,
    },
  } as any;
}

describe('atomic cart edit preview lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCartStore.setState({ items: [{ ...existingItem }] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('replaces the exact artifact in place without changing the stable line ID', () => {
    const placement = readyPlacement();
    useCartStore.getState().updateCartItem(
      existingItem.id,
      editedQuote(placement),
      undefined,
      { unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 8000 },
    );

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(existingItem.id);
    expect(items[0].placement_preview).toEqual(placement);
    expect(items[0].thumbnail_url).toBe(placement.previewUrl);
    expect(items[0].web_preview_url).toBe(placement.previewUrl);
    expect(items[0].composition_signature).toBe(placement.compositionSignature);
    expect(items[0].composition_revision).toBe(placement.compositionRevision);
  });

  it('leaves the existing line untouched when the replacement artifact is not ready', () => {
    const invalid = { ...readyPlacement(), uploadStatus: 'pending' as const };
    expect(() => useCartStore.getState().updateCartItem(
      existingItem.id,
      editedQuote(invalid as any),
      undefined,
      { unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 8000 },
    )).toThrow(/non-ready exact preview/);

    expect(useCartStore.getState().items).toEqual([{ ...existingItem }]);
  });

  it('rejects an intrinsically valid artifact that belongs to another line size', () => {
    const mismatchedQuote = { ...editedQuote(), widthIn: 48 };

    expect(() => useCartStore.getState().updateCartItem(
      existingItem.id,
      mismatchedQuote,
      undefined,
      { unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 8000 },
    )).toThrow(/identity does not match/);
    expect(useCartStore.getState().items).toEqual([{ ...existingItem }]);
  });

  it('never reuses an old canonical artifact when an edit supplies no replacement', () => {
    const oldPlacement = readyPlacement();
    useCartStore.setState({
      items: [{
        ...existingItem,
        width_in: oldPlacement.widthIn,
        height_in: oldPlacement.heightIn,
        placement_preview: oldPlacement,
        composition_signature: oldPlacement.compositionSignature,
        composition_revision: oldPlacement.compositionRevision,
        thumbnail_url: oldPlacement.previewUrl,
        web_preview_url: oldPlacement.previewUrl,
      }],
    });
    const quote = {
      ...editedQuote(),
      placementPreview: undefined,
      thumbnailUrl: oldPlacement.previewUrl,
      webPreviewUrl: oldPlacement.previewUrl,
      imagePosition: { x: 25, y: 10 },
    };

    useCartStore.getState().updateCartItem(
      existingItem.id,
      quote,
      undefined,
      { unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 8000 },
    );

    const updated = useCartStore.getState().items[0];
    expect(updated.placement_preview).toBeUndefined();
    expect(updated.composition_signature).toBeUndefined();
    expect(updated.composition_revision).toBeUndefined();
    expect(updated.thumbnail_url).toBeUndefined();
    expect(updated.web_preview_url).toBeUndefined();
  });

  it('refuses to create a new line that claims a non-ready exact artifact', () => {
    useCartStore.setState({ items: [] });
    const invalid = { ...readyPlacement(), uploadStatus: 'failed' as const };
    let rejected: unknown;
    try {
      useCartStore.getState().addFromQuote(
        editedQuote(invalid as any),
        undefined,
        { unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 8000 },
      );
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toMatchObject({ code: 'PERMANENT_PREVIEW_UNAVAILABLE' });
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('refuses to create a new line with a ready artifact for another size', () => {
    useCartStore.setState({ items: [] });
    expect(() => useCartStore.getState().addFromQuote(
      { ...editedQuote(), heightIn: 24 },
      undefined,
      { unit_price_cents: 4000, rope_cost_cents: 0, pole_pocket_cost_cents: 0, line_total_cents: 8000 },
    )).toThrow(/identity does not match/);
    expect(useCartStore.getState().items).toEqual([]);
  });
});
