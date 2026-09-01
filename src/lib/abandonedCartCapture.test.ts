import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/store/cart';
import {
  ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES,
  ABANDONED_CART_SNAPSHOT_METADATA_KEY,
  awaitBoundedAbandonedCartSnapshot,
  buildDesignerRecoveryFields,
  cartItemHasArtwork,
  normalizeCaptureContact,
  paymentSnapshotRequiredButMissing,
  readStoredAbandonedCartRecoveryAttribution,
  readStoredAbandonedCartId,
  sanitizeSnapshotItems,
  selectAbandonedCartPaymentAttribution,
  writeStoredAbandonedCartRecoveryAttribution,
  writeStoredAbandonedCartId,
} from '@/lib/abandonedCartCapture';

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'item-1',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 2,
  material: '13oz',
  grommets: 'every-2ft',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 8,
  unit_price_cents: 2_000,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 4_000,
  created_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
};

describe('abandoned-cart capture payloads', () => {
  it('normalizes valid checkout contact data and rejects partial emails', () => {
    expect(normalizeCaptureContact({
      email: '  Buyer@Example.COM ',
      phone: '+1 (215) 555-0199',
      firstName: '  Ada   Marie ',
      lastName: ' Lovelace ',
    })).toEqual({
      email: 'buyer@example.com',
      phone: '+12155550199',
      firstName: 'Ada Marie',
      lastName: 'Lovelace',
    });
    expect(normalizeCaptureContact({ email: 'buyer@' }).email).toBeNull();
  });

  it('keeps analytic and recovery fields while removing inline artwork blobs', () => {
    const [snapshot] = sanitizeSnapshotItems([item({
      file_key: 'uploads/artwork.pdf',
      file_url: 'data:application/pdf;base64,AAAA',
      thumbnail_url: 'blob:https://example.com/local-preview',
      final_render_url: 'https://res.cloudinary.com/example/final.png',
    })]);

    expect(snapshot).toMatchObject({
      width_in: 48,
      height_in: 24,
      quantity: 2,
      material: '13oz',
      line_total_cents: 4_000,
      file_key: 'uploads/artwork.pdf',
      file_url: null,
      thumbnail_url: null,
      final_render_url: 'https://res.cloudinary.com/example/final.png',
      has_artwork: true,
    });
    expect(cartItemHasArtwork(snapshot)).toBe(true);
  });

  it('records an explicit false for current items without artwork', () => {
    expect(sanitizeSnapshotItems([item()])[0]?.has_artwork).toBe(false);
  });

  it('preserves a complete editable design in a normal foreground snapshot', () => {
    const canvasStateJson = JSON.stringify({
      version: 3,
      orientation: 'landscape',
      constrainProportions: false,
      originalWidth: 2400,
      originalHeight: 1200,
      scene: 'x'.repeat(50_000),
    });
    const source = item({
      file_key: 'uploads/banner.png',
      file_url: 'https://res.cloudinary.com/example/image/upload/banner.png',
      canvas_state_json: canvasStateJson,
      image_position: { x: 12.5, y: -4.25 },
      image_scale: 1.2,
      image_scale_y: 1.2,
      pole_pockets: 'top-bottom',
      pole_pocket_size: '3',
      artwork_manifest: {
        originalUrl: 'https://res.cloudinary.com/example/image/upload/banner.png',
        publicId: 'uploads/banner',
        version: 3,
        resourceType: 'image',
        format: 'png',
        mimeType: 'image/png',
        originalFilename: 'banner.png',
        bytes: 1234,
        width: 2400,
        height: 1200,
        uploadStatus: 'uploaded',
        uploadedAt: '2026-09-01T00:00:00.000Z',
      },
      placement_preview: {
        version: 3,
        sourceIdentity: 'uploads/banner@3@1',
        sourceUrl: 'https://res.cloudinary.com/example/image/upload/banner.png',
        productType: 'banner',
        widthIn: 48,
        heightIn: 24,
        fitMode: 'fit',
        positionPct: { x: 12.5, y: -4.25 },
        scaleX: 1.2,
        scaleY: 1.2,
        compositionRevision: 7,
        compositionSignature: 'signature',
        url: 'https://res.cloudinary.com/example/image/upload/preview.jpg',
        publicId: 'previews/banner',
        previewUrl: 'https://res.cloudinary.com/example/image/upload/preview.jpg',
        previewPublicId: 'previews/banner',
        previewWidthPx: 1200,
        previewHeightPx: 600,
        uploadStatus: 'uploaded',
      } as any,
      ...({
        artwork_width: 2400,
        artwork_height: 1200,
        design_draft_contact: 'buyer@example.com',
      } as any),
    });

    const [snapshot] = sanitizeSnapshotItems([source], { mode: 'full' });
    const metadata = snapshot[ABANDONED_CART_SNAPSHOT_METADATA_KEY] as Record<string, unknown>;

    expect(metadata).toMatchObject({
      version: 1,
      sourceItemCount: 1,
      storedItemCount: 1,
      complete: true,
      fidelity: 'full',
      requiredFieldsComplete: true,
      incompleteReasons: [],
    });
    expect(snapshot).toMatchObject({
      canvas_state_json: canvasStateJson,
      artwork_width: 2400,
      artwork_height: 1200,
      design_draft_contact: 'buyer@example.com',
      orientation: 'landscape',
      constrain_proportions: false,
      normalized_placement: {
        x_pct: 12.5,
        y_pct: -4.25,
        scale_x: 1.2,
        scale_y: 1.2,
        fit_mode: 'fit',
      },
      pole_pocket_size: '3',
    });
    expect(buildDesignerRecoveryFields(snapshot)).toMatchObject({
      constrain_proportions: false,
      normalized_placement: { x_pct: 12.5, y_pct: -4.25 },
    });
  });

  it('stays below the browser keepalive body limit for artwork-heavy carts', () => {
    const hugeScene = JSON.stringify({ text: 'x'.repeat(100_000) });
    const items = Array.from({ length: 60 }, (_, index) => item({
      id: `item-${index}`,
      file_key: `uploads/${index}.pdf`,
      canvas_state_json: hugeScene,
      design_request_text: 'y'.repeat(20_000),
    }));
    const cartItems = sanitizeSnapshotItems(items, { mode: 'compact' });
    const body = JSON.stringify({
      cartItems,
      email: 'buyer@example.com',
      stage: 'contact',
      subtotalCents: 40_000,
      discountCents: 2_000,
      taxCents: 2_280,
      estimatedTotalCents: 40_280,
    });

    expect(cartItems).toHaveLength(40);
    expect(body.length).toBeLessThan(55_000);
    expect(new TextEncoder().encode(JSON.stringify(cartItems)).byteLength)
      .toBeLessThanOrEqual(ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES);
    expect(cartItems[0]?.[ABANDONED_CART_SNAPSHOT_METADATA_KEY]).toMatchObject({
      version: 1,
      sourceItemCount: 60,
      storedItemCount: 40,
      complete: false,
      fidelity: 'compact',
      requiredFieldsComplete: false,
    });
  });

  it('keeps every supported line when artwork would otherwise exhaust the size budget', () => {
    const cartItems = sanitizeSnapshotItems(Array.from({ length: 30 }, (_, index) => item({
      id: `large-artwork-line-${index}`,
      file_key: `uploads/${index}.pdf`,
      canvas_state_json: JSON.stringify({ scene: 'x'.repeat(50_000) }),
      design_request_text: 'y'.repeat(50_000),
      line_total_cents: 2_000 + index,
    })), { mode: 'compact' });

    expect(cartItems).toHaveLength(30);
    expect(cartItems.map((entry) => entry.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => `large-artwork-line-${index}`),
    );
    expect(new TextEncoder().encode(JSON.stringify(cartItems)).byteLength)
      .toBeLessThanOrEqual(ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES);
    expect(cartItems.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'canvas_state_json')))
      .toBe(true);
    expect(cartItems.every((entry) => Number.isFinite(Number(entry.line_total_cents))))
      .toBe(true);
    expect(cartItems[0]?.[ABANDONED_CART_SNAPSHOT_METADATA_KEY]).toMatchObject({
      version: 1,
      sourceItemCount: 30,
      storedItemCount: 30,
      complete: false,
      fidelity: 'compact',
      requiredFieldsComplete: false,
    });
    expect(Object.keys(cartItems[0] || {})[0]).toBe(ABANDONED_CART_SNAPSHOT_METADATA_KEY);
  });

  it('marks an item count beyond the supported recovery limit as incomplete', () => {
    const cartItems = sanitizeSnapshotItems(Array.from({ length: 41 }, (_, index) => item({
      id: `line-${index}`,
    })));

    expect(cartItems).toHaveLength(40);
    expect(cartItems[0]?.[ABANDONED_CART_SNAPSHOT_METADATA_KEY]).toMatchObject({
      version: 1,
      sourceItemCount: 41,
      storedItemCount: 40,
      complete: false,
      fidelity: 'full',
      requiredFieldsComplete: false,
    });
  });

  it('persists only valid returned cart UUIDs and clears them with the cart', () => {
    const storage = memoryStorage();
    const id = '018f5f57-89ab-7def-8abc-0123456789ab';
    writeStoredAbandonedCartId(id, storage);
    expect(readStoredAbandonedCartId(storage)).toBe(id);

    writeStoredAbandonedCartId('not-a-cart-id', storage);
    expect(readStoredAbandonedCartId(storage)).toBeNull();
  });

  it('keeps signed recovery attribution separate from the ordinary snapshot id', () => {
    const storage = memoryStorage();
    const ordinaryId = '018f5f57-89ab-7def-8abc-0123456789ab';
    const recoveredId = '11111111-1111-4111-8111-111111111111';
    writeStoredAbandonedCartId(ordinaryId, storage);
    writeStoredAbandonedCartRecoveryAttribution({
      cartId: recoveredId,
      token: 'payload.signature',
    }, storage);

    expect(readStoredAbandonedCartId(storage)).toBe(ordinaryId);
    expect(readStoredAbandonedCartRecoveryAttribution(storage)).toEqual({
      cartId: recoveredId,
      token: 'payload.signature',
    });

    writeStoredAbandonedCartRecoveryAttribution({ cartId: recoveredId, token: 'unsigned' }, storage);
    expect(readStoredAbandonedCartRecoveryAttribution(storage)).toBeNull();
    expect(readStoredAbandonedCartId(storage)).toBe(ordinaryId);
  });

  it('waits briefly for a payment-stage snapshot and reports a timeout', async () => {
    await expect(awaitBoundedAbandonedCartSnapshot(Promise.resolve({ cartId: 'ready' }), 25))
      .resolves.toEqual({ cartId: 'ready' });
    await expect(awaitBoundedAbandonedCartSnapshot(new Promise(() => {}), 25))
      .resolves.toBeNull();
  });

  it('blocks provider handoff when a tracked cart cannot persist payment_started', () => {
    expect(paymentSnapshotRequiredButMissing({
      capturedCartId: null,
      storedCartId: '11111111-1111-4111-8111-111111111111',
      sessionId: 'session-1',
    })).toBe(true);
    expect(paymentSnapshotRequiredButMissing({
      capturedCartId: '22222222-2222-4222-8222-222222222222',
      storedCartId: '11111111-1111-4111-8111-111111111111',
      sessionId: 'session-1',
    })).toBe(false);
    expect(paymentSnapshotRequiredButMissing({
      capturedCartId: null,
      storedCartId: null,
      sessionId: null,
    })).toBe(false);
  });

  it('sends the signed emailed-cart identity instead of a replacement session snapshot', () => {
    expect(selectAbandonedCartPaymentAttribution({
      recoveryAttribution: {
        cartId: '11111111-1111-4111-8111-111111111111',
        token: 'payload.signature',
      },
      capturedCartId: '22222222-2222-4222-8222-222222222222',
      storedCartId: '33333333-3333-4333-8333-333333333333',
      sessionId: 'sess_replacement_device',
    })).toEqual({
      abandonedCartId: '11111111-1111-4111-8111-111111111111',
      abandonedCartSessionId: 'sess_replacement_device',
      abandonedCartRecoveryToken: 'payload.signature',
    });

    expect(selectAbandonedCartPaymentAttribution({
      capturedCartId: '22222222-2222-4222-8222-222222222222',
      storedCartId: '33333333-3333-4333-8333-333333333333',
    }).abandonedCartId).toBe('22222222-2222-4222-8222-222222222222');
  });
});
