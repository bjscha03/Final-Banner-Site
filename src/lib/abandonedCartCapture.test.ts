import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/store/cart';
import {
  ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES,
  ABANDONED_CART_SNAPSHOT_METADATA_KEY,
  awaitBoundedAbandonedCartSnapshot,
  cartItemHasArtwork,
  normalizeCaptureContact,
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

  it('stays below the browser keepalive body limit for artwork-heavy carts', () => {
    const hugeScene = JSON.stringify({ text: 'x'.repeat(100_000) });
    const items = Array.from({ length: 60 }, (_, index) => item({
      id: `item-${index}`,
      file_key: `uploads/${index}.pdf`,
      canvas_state_json: hugeScene,
      design_request_text: 'y'.repeat(20_000),
    }));
    const cartItems = sanitizeSnapshotItems(items);
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
    expect(cartItems[0]?.[ABANDONED_CART_SNAPSHOT_METADATA_KEY]).toEqual({
      version: 1,
      sourceItemCount: 60,
      storedItemCount: 40,
      complete: false,
    });
  });

  it('keeps every supported line when artwork would otherwise exhaust the size budget', () => {
    const cartItems = sanitizeSnapshotItems(Array.from({ length: 30 }, (_, index) => item({
      id: `large-artwork-line-${index}`,
      file_key: `uploads/${index}.pdf`,
      canvas_state_json: JSON.stringify({ scene: 'x'.repeat(50_000) }),
      design_request_text: 'y'.repeat(50_000),
      line_total_cents: 2_000 + index,
    })));

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
    expect(cartItems[0]?.[ABANDONED_CART_SNAPSHOT_METADATA_KEY]).toEqual({
      version: 1,
      sourceItemCount: 30,
      storedItemCount: 30,
      complete: true,
    });
    expect(Object.keys(cartItems[0] || {})[0]).toBe(ABANDONED_CART_SNAPSHOT_METADATA_KEY);
  });

  it('marks an item count beyond the supported recovery limit as incomplete', () => {
    const cartItems = sanitizeSnapshotItems(Array.from({ length: 41 }, (_, index) => item({
      id: `line-${index}`,
    })));

    expect(cartItems).toHaveLength(40);
    expect(cartItems[0]?.[ABANDONED_CART_SNAPSHOT_METADATA_KEY]).toEqual({
      version: 1,
      sourceItemCount: 41,
      storedItemCount: 40,
      complete: false,
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

  it('waits briefly for a payment-stage snapshot and then fails open', async () => {
    await expect(awaitBoundedAbandonedCartSnapshot(Promise.resolve({ cartId: 'ready' }), 25))
      .resolves.toEqual({ cartId: 'ready' });
    await expect(awaitBoundedAbandonedCartSnapshot(new Promise(() => {}), 25))
      .resolves.toBeNull();
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
