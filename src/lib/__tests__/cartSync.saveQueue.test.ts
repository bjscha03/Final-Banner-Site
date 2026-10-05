import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartSyncService } from '../cartSync';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const item = (id: string) => ({
  id,
  width_in: 120,
  height_in: 48,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 40,
  unit_price_cents: 10000,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 10000,
}) as any;

describe('cartSync same-owner save queue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('captures immediately even when the main cart save is slow and then fails', async () => {
    let failSave!: () => void;
    const mainSave = new Promise<Response>((resolve) => {
      failSave = () => resolve(new Response('unavailable', { status: 503 }));
    });
    const snapshots: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/cart-save')) return mainSave;
      snapshots.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));
    const saving = cartSyncService.saveCart([item('kept')], undefined, 'test_capture_failure');
    await vi.waitFor(() => expect(snapshots).toHaveLength(1));
    expect(snapshots[0].cartItems[0].id).toBe('kept');
    failSave();
    await expect(saving).resolves.toBe(false);
    await expect(cartSyncService.saveCart([], undefined, 'test_capture_failure')).resolves.toBe(false);
    expect(snapshots[1].cartItems).toEqual([]);
    expect(snapshots[1].snapshotRevision).toBeGreaterThan(snapshots[0].snapshotRevision);
  });

  it('releases the save queue when recovery capture hangs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/cart-save')) return new Response('{}', { status: 200 });
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
    const saving = cartSyncService.saveCart([item('timeout')], undefined, 'test_capture_timeout');
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(saving).resolves.toBe(true);
  });

  it('serializes saves and coalesces waiting snapshots to the newest cart', async () => {
    let releaseFirst!: () => void;
    const firstResponse = new Promise<Response>((resolve) => {
      releaseFirst = () => resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });
    const cartBodies: any[] = [];
    let cartSaveCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const pathname = String(url);
      if (pathname.includes('/cart-save')) {
        cartSaveCalls += 1;
        cartBodies.push(JSON.parse(String(init?.body || '{}')));
        if (cartSaveCalls === 1) return firstResponse;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (pathname.includes('/save-cart-snapshot')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = cartSyncService.saveCart([item('first')], USER_ID);
    await vi.waitFor(() => expect(cartSaveCalls).toBe(1));
    const second = cartSyncService.saveCart([item('second')], USER_ID);
    const newest = cartSyncService.saveCart([item('newest')], USER_ID);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cartSaveCalls).toBe(1);
    releaseFirst();

    await expect(Promise.all([first, second, newest])).resolves.toEqual([true, true, true]);
    expect(cartSaveCalls).toBe(2);
    expect(cartBodies.map((body) => body.cartData[0].id)).toEqual(['first', 'newest']);
  });

  it('does not serialize different cart owners behind one another', async () => {
    let release!: () => void;
    const blocked = new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    });
    const seenOwners: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/cart-save')) {
        const body = JSON.parse(String(init?.body || '{}'));
        seenOwners.push(body.userId);
        if (body.userId === USER_ID) return blocked;
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));

    const first = cartSyncService.saveCart([item('one')], USER_ID);
    const otherOwner = cartSyncService.saveCart(
      [item('two')],
      '22222222-2222-4222-8222-222222222222',
    );
    await expect(otherOwner).resolves.toBe(true);
    expect(seenOwners).toContain('22222222-2222-4222-8222-222222222222');
    release();
    await expect(first).resolves.toBe(true);
  });
});
