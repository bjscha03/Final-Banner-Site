import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearAbandonedCartRecoveryQuery,
  readAbandonedCartRecoveryToken,
  restoreAbandonedCartFromToken,
} from './abandonedCartRecovery';
import { readStoredAbandonedCartRecoveryAttribution } from './abandonedCartCapture';

const CART_ID = '11111111-1111-4111-8111-111111111111';
const RECOVERY_TOKEN = 'signed.recovery-token';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

const recoveredItem = {
  id: 'recovered-line',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 8,
  unit_price_cents: 3200,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 3200,
  created_at: '2026-09-01T12:00:00.000Z',
};

describe('abandoned cart recovery client', () => {
  it('restores signed endpoint items and validates only the server-linked discount code', async () => {
    const sessionStorage = memoryStorage();
    vi.stubGlobal('window', { sessionStorage });
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      if (String(input).includes('recover-abandoned-cart')) {
        return new Response(JSON.stringify({
          success: true,
          complete: true,
          cartId: CART_ID,
          recoveryToken: RECOVERY_TOKEN,
          items: [recoveredItem],
          sourceItemCount: 1,
          storedItemCount: 1,
          discountCode: 'CART10-SIGNED',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        valid: true,
        discount: {
          id: 'discount-id',
          code: 'CART10-SIGNED',
          discountPercentage: 10,
          discountAmountCents: null,
          expiresAt: '2026-09-02T12:00:00.000Z',
          source: 'discount_codes',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const replaceCartItems = vi.fn(async () => {
      // Replacement synchronizes immediately. A new tab/device must already
      // expose signed attribution to that very first nonempty snapshot.
      expect(readStoredAbandonedCartRecoveryAttribution(sessionStorage)).toEqual({
        cartId: CART_ID,
        token: RECOVERY_TOKEN,
      });
    });
    const applyValidatedDiscount = vi.fn();

    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl,
      replaceCartItems,
      applyValidatedDiscount,
    });

    expect(outcome).toMatchObject({
      ok: true,
      status: 'restored',
      itemCount: 1,
      discountStatus: 'applied',
    });
    expect(replaceCartItems).toHaveBeenCalledWith([recoveredItem]);
    expect(applyValidatedDiscount).toHaveBeenCalledWith(expect.objectContaining({ code: 'CART10-SIGNED' }));
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ token: RECOVERY_TOKEN });
    expect(readStoredAbandonedCartRecoveryAttribution(sessionStorage)).toEqual({
      cartId: CART_ID,
      token: RECOVERY_TOKEN,
    });
    const validationBody = JSON.parse(String(requests[1].init?.body));
    expect(validationBody).toEqual({ code: 'CART10-SIGNED' });
    expect(validationBody).not.toHaveProperty('email');
    expect(validationBody).not.toHaveProperty('userId');
  });

  it('never treats an arbitrary URL discount as recovery authority', async () => {
    expect(readAbandonedCartRecoveryToken('?discount=EVIL&cart=public-id')).toBeNull();
    expect(readAbandonedCartRecoveryToken('?recovery=signed.token&discount=EVIL')).toBe('signed.token');

    const fetchImpl = vi.fn();
    const outcome = await restoreAbandonedCartFromToken({
      token: readAbandonedCartRecoveryToken('?discount=EVIL'),
      fetchImpl,
      replaceCartItems: vi.fn(),
      applyValidatedDiscount: vi.fn(),
    });
    expect(outcome).toMatchObject({ ok: false, status: 'not_requested' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a clear expired outcome without mutating the cart', async () => {
    const replaceCartItems = vi.fn();
    const outcome = await restoreAbandonedCartFromToken({
      token: 'expired.token',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: 'RECOVERY_LINK_EXPIRED',
      }), { status: 410, headers: { 'Content-Type': 'application/json' } })),
      replaceCartItems,
      applyValidatedDiscount: vi.fn(),
    });
    expect(outcome).toEqual({
      ok: false,
      status: 'expired',
      message: 'This cart recovery link has expired.',
    });
    expect(replaceCartItems).not.toHaveBeenCalled();
  });

  it('bounds a hanging recovery request and leaves the cart unchanged', async () => {
    const replaceCartItems = vi.fn();
    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl: vi.fn(() => new Promise<Response>(() => {})),
      replaceCartItems,
      applyValidatedDiscount: vi.fn(),
      requestTimeoutMs: 25,
    });

    expect(outcome).toEqual({
      ok: false,
      status: 'unavailable',
      message: 'Cart recovery is temporarily unavailable.',
    });
    expect(replaceCartItems).not.toHaveBeenCalled();
  });

  it('bounds hanging discount validation without discarding the restored cart', async () => {
    const replaceCartItems = vi.fn();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('recover-abandoned-cart')) {
        return new Response(JSON.stringify({
          success: true,
          complete: true,
          cartId: CART_ID,
          recoveryToken: RECOVERY_TOKEN,
          items: [recoveredItem],
          sourceItemCount: 1,
          storedItemCount: 1,
          discountCode: 'CART10-SIGNED',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Promise<Response>(() => {});
    });

    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl,
      replaceCartItems,
      applyValidatedDiscount: vi.fn(),
      requestTimeoutMs: 25,
    });

    expect(outcome).toMatchObject({
      ok: true,
      status: 'restored',
      discountStatus: 'unavailable',
    });
    expect(replaceCartItems).toHaveBeenCalledWith([recoveredItem]);
  });

  it('keeps the current cart intact when the server reports a truncated snapshot', async () => {
    const replaceCartItems = vi.fn();
    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        success: false,
        complete: false,
        error: 'RECOVERY_CART_INCOMPLETE',
        sourceItemCount: 41,
        storedItemCount: 40,
      }), { status: 409, headers: { 'Content-Type': 'application/json' } })),
      replaceCartItems,
      applyValidatedDiscount: vi.fn(),
    });

    expect(outcome).toEqual({
      ok: false,
      status: 'incomplete',
      message: 'This saved cart is incomplete, so it was not restored. Please rebuild your cart or contact support.',
    });
    expect(replaceCartItems).not.toHaveBeenCalled();
  });

  it('refuses a nominal success response without matching completeness counts', async () => {
    const replaceCartItems = vi.fn();
    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        success: true,
        complete: true,
        cartId: CART_ID,
        recoveryToken: RECOVERY_TOKEN,
        items: [recoveredItem],
        sourceItemCount: 30,
        storedItemCount: 29,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      replaceCartItems,
      applyValidatedDiscount: vi.fn(),
    });

    expect(outcome).toMatchObject({ ok: false, status: 'incomplete' });
    expect(outcome.message).toContain('every saved item');
    expect(replaceCartItems).not.toHaveBeenCalled();
  });

  it('clears provisional signed ownership when the recovered cart cannot be persisted', async () => {
    const sessionStorage = memoryStorage();
    vi.stubGlobal('window', { sessionStorage });
    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        success: true,
        complete: true,
        cartId: CART_ID,
        recoveryToken: RECOVERY_TOKEN,
        items: [recoveredItem],
        sourceItemCount: 1,
        storedItemCount: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      replaceCartItems: vi.fn(async () => { throw new Error('sync failed'); }),
      applyValidatedDiscount: vi.fn(),
    });

    expect(outcome).toEqual({
      ok: false,
      status: 'unavailable',
      message: 'The recovered cart could not be saved.',
    });
    expect(readStoredAbandonedCartRecoveryAttribution(sessionStorage)).toBeNull();
  });

  it('removes signed and retired unsigned recovery parameters after handling', () => {
    const replaceState = vi.fn();
    const result = clearAbandonedCartRecoveryQuery({
      locationHref: 'https://banners.example/checkout?recovery=signed.token&discount=EVIL&keep=1#payment',
      replaceState,
    });
    expect(result).toBe('/checkout?keep=1#payment');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/checkout?keep=1#payment');
  });
});
