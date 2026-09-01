import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartSyncService } from '@/lib/cartSync';
import type { CartItem } from '@/store/cart';
import captureHookSource from '@/hooks/useAbandonedCartCapture.ts?raw';

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

const cartItem: CartItem = {
  id: 'capture-item',
  product_type: 'banner',
  width_in: 72,
  height_in: 36,
  quantity: 2,
  material: '13oz',
  grommets: 'every-2ft',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 18,
  unit_price_cents: 5_000,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 10_000,
  file_key: 'uploads/banner.pdf',
  created_at: '2026-09-01T00:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cartSync abandoned checkout capture', () => {
  it('pagehide flush reads the latest contact before assigning its newer request revision', () => {
    expect(captureHookSource).toMatch(/latestRef\.current = \{[\s\S]*?customer: normalizedCustomer/);
    expect(captureHookSource).toMatch(
      /const flush = \(\) => \{[\s\S]*?const latest = latestRef\.current;[\s\S]*?latest\.customer\.email[\s\S]*?saveProgress\('contact'\)/,
    );
    expect(captureHookSource).toMatch(/window\.addEventListener\('pagehide', flush\)/);
  });

  it('uses the session checkout draft and persists the returned cart id', async () => {
    const sessionStorage = memoryStorage();
    const localStorage = memoryStorage();
    sessionStorage.setItem('bof-checkout-customer-v1', JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      customer: {
        firstName: '  Ada ',
        lastName: ' Lovelace ',
        email: ' Buyer@Example.COM ',
        phone: '+1 (215) 555-0199',
        shippingSame: true,
      },
    }));
    vi.stubGlobal('window', {
      sessionStorage,
      location: { protocol: 'https:' },
    });
    vi.stubGlobal('document', { cookie: 'cart_session_id=sess_capture_123456' });
    vi.stubGlobal('localStorage', localStorage);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      cartId: '018f5f57-89ab-7def-8abc-0123456789ab',
      status: 'active',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await cartSyncService.saveCartSnapshot(
      [cartItem],
      undefined,
      'sess_capture_123456',
      {
        stage: 'contact',
        totals: {
          subtotalCents: 10_000,
          discountCents: 1_000,
          taxCents: 540,
          estimatedTotalCents: 9_540,
        },
      },
    );

    expect(saved?.cartId).toBe('018f5f57-89ab-7def-8abc-0123456789ab');
    expect(sessionStorage.getItem('bof-abandoned-cart-id-v1')).toBe(saved?.cartId);
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(init.body));
    expect(init).toMatchObject({ keepalive: true, credentials: 'same-origin' });
    expect(payload).toMatchObject({
      sessionId: 'sess_capture_123456',
      email: 'buyer@example.com',
      phone: '+12155550199',
      firstName: 'Ada',
      lastName: 'Lovelace',
      stage: 'contact',
      subtotalCents: 10_000,
      discountCents: 1_000,
      taxCents: 540,
      estimatedTotalCents: 9_540,
    });
    expect(payload.snapshotRevision).toEqual(expect.any(Number));
    expect(payload.cartItems[0]).toMatchObject({
      width_in: 72,
      height_in: 36,
      quantity: 2,
      material: '13oz',
      file_key: 'uploads/banner.pdf',
    });
  });

  it('forwards signed recovery ownership on the first snapshot from a new session', async () => {
    const sessionStorage = memoryStorage();
    const recoveryCartId = '11111111-1111-4111-8111-111111111111';
    sessionStorage.setItem('bof-abandoned-cart-recovery-attribution-v1', JSON.stringify({
      cartId: recoveryCartId,
      token: 'payload.signature',
    }));
    vi.stubGlobal('window', { sessionStorage, location: { protocol: 'https:' } });
    vi.stubGlobal('document', { cookie: 'cart_session_id=sess_new_device_123456' });
    vi.stubGlobal('localStorage', memoryStorage());
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      cartId: recoveryCartId,
      status: 'active',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await cartSyncService.saveCartSnapshot(
      [cartItem],
      undefined,
      'sess_new_device_123456',
      { stage: 'checkout' },
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sessionId: 'sess_new_device_123456',
      existingCartId: null,
      recoveryCartId,
      recoveryToken: 'payload.signature',
      snapshotRevision: expect.any(Number),
    });
  });

  it('gives a later concurrent contact snapshot a strictly newer revision', async () => {
    const sessionStorage = memoryStorage();
    vi.stubGlobal('window', { sessionStorage, location: { protocol: 'https:' } });
    vi.stubGlobal('document', { cookie: 'cart_session_id=sess_revision_123456' });
    vi.stubGlobal('localStorage', memoryStorage());
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        success: true,
        cartId: '22222222-2222-4222-8222-222222222222',
        status: 'active',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      cartSyncService.saveCartSnapshot([cartItem], undefined, 'sess_revision_123456', {
        stage: 'contact',
        contact: { email: 'first@example.com' },
      }),
      cartSyncService.saveCartSnapshot([cartItem], undefined, 'sess_revision_123456', {
        stage: 'contact',
        contact: { email: 'latest@example.com' },
      }),
    ]);

    expect(payloads).toHaveLength(2);
    expect(payloads.map((payload) => payload.email)).toEqual([
      'first@example.com',
      'latest@example.com',
    ]);
    expect(Number(payloads[1].snapshotRevision)).toBeGreaterThan(
      Number(payloads[0].snapshotRevision),
    );
  });

  it('sends an empty snapshot and clears the local association', async () => {
    const sessionStorage = memoryStorage();
    sessionStorage.setItem('bof-abandoned-cart-id-v1', '018f5f57-89ab-7def-8abc-0123456789ab');
    sessionStorage.setItem('bof-abandoned-cart-recovery-attribution-v1', JSON.stringify({
      cartId: '11111111-1111-4111-8111-111111111111',
      token: 'payload.signature',
    }));
    vi.stubGlobal('window', { sessionStorage, location: { protocol: 'https:' } });
    vi.stubGlobal('document', { cookie: 'cart_session_id=sess_capture_123456' });
    vi.stubGlobal('localStorage', memoryStorage());
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      closed: true,
      status: 'expired',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await cartSyncService.saveCartSnapshot([], undefined, 'sess_capture_123456');

    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(init.body));
    expect(payload.cartItems).toEqual([]);
    expect(payload.snapshotRevision).toEqual(expect.any(Number));
    expect(sessionStorage.getItem('bof-abandoned-cart-id-v1')).toBeNull();
    expect(sessionStorage.getItem('bof-abandoned-cart-recovery-attribution-v1')).toBeNull();
  });
});
