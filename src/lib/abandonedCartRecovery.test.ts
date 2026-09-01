import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY,
  clearAbandonedCartRecoveryQuery,
  clearStoredAbandonedCartRecoveryRetryToken,
  isAbandonedCartRecoveryTokenRetryable,
  prepareAbandonedCartRecoveryToken,
  readAbandonedCartRecoveryToken,
  readStoredAbandonedCartRecoveryRetryToken,
  restoreAbandonedCartFromToken,
} from './abandonedCartRecovery';
import { readStoredAbandonedCartRecoveryAttribution } from './abandonedCartCapture';

const CART_ID = '11111111-1111-4111-8111-111111111111';
const RECOVERY_TOKEN = 'signed.recovery-token';

const expiringRecoveryToken = (expiresAtSeconds: number): string => {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    c: CART_ID,
    s: 1,
    exp: expiresAtSeconds,
  })).toString('base64url');
  return `${payload}.test-signature`;
};

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
    expect(validationBody).toEqual({ code: 'CART10-SIGNED', cartId: CART_ID });
    expect(validationBody).not.toHaveProperty('email');
    expect(validationBody).not.toHaveProperty('userId');
  });

  it('auto-applies complete scoped recovery metadata only for the restored cart', async () => {
    const largeItem = {
      ...recoveredItem,
      id: 'large-line',
      width_in: 72,
      height_in: 36,
      line_total_cents: 10000,
    };
    const applyValidatedDiscount = vi.fn();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('recover-abandoned-cart')) {
        return new Response(JSON.stringify({
          success: true,
          complete: true,
          cartId: CART_ID,
          recoveryToken: RECOVERY_TOKEN,
          items: [largeItem],
          sourceItemCount: 1,
          storedItemCount: 1,
          discountCode: 'CART25-SIGNED',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        valid: true,
        discount: {
          id: 'discount-id',
          code: 'CART25-SIGNED',
          discountPercentage: 25,
          discountAmountCents: null,
          expiresAt: '2099-12-31T23:59:59.000Z',
          source: 'discount_codes',
          recoveryOffer: true,
          recoveryCartId: CART_ID,
          campaign: 'abandoned_cart_large_banner_25',
          discountScope: 'recovery_qualifying_banner_lines',
          eligibleCartItemIds: ['large-line'],
          maxDiscountAmountCents: 2500,
          activatedAt: '2026-09-01T12:00:00.000Z',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const outcome = await restoreAbandonedCartFromToken({
      token: RECOVERY_TOKEN,
      fetchImpl,
      replaceCartItems: vi.fn(),
      applyValidatedDiscount,
    });

    expect(outcome).toMatchObject({ ok: true, discountStatus: 'applied' });
    expect(applyValidatedDiscount).toHaveBeenCalledWith(expect.objectContaining({
      discountScope: 'recovery_qualifying_banner_lines',
      eligibleCartItemIds: ['large-line'],
      maxDiscountAmountCents: 2500,
    }));
  });

  it('never treats an arbitrary URL discount as recovery authority', async () => {
    expect(readAbandonedCartRecoveryToken('?discount=EVIL&cart=public-id')).toBeNull();
    expect(readAbandonedCartRecoveryToken('?recovery=signed.token&discount=EVIL')).toBe('signed.token');
    expect(readAbandonedCartRecoveryToken('#recovery=signed.token')).toBe('signed.token');
    expect(readAbandonedCartRecoveryToken('https://banners.example/checkout#recovery=signed.token')).toBe('signed.token');
    expect(readAbandonedCartRecoveryToken(
      'https://banners.example/checkout?recovery=first.token#recovery=second.token',
    )).toBeNull();

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

  it('ignores a valid response after checkout or account identity revokes the attempt', async () => {
    const replaceCartItems = vi.fn();
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
      replaceCartItems,
      applyValidatedDiscount: vi.fn(),
      shouldApply: () => false,
    });

    expect(outcome).toMatchObject({ ok: false, status: 'closed' });
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

  it('restores server-saved checkout preferences after replacing the exact cart', async () => {
    const replaceCartItems = vi.fn();
    const restoreCheckoutPreferences = vi.fn();
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
        checkoutState: {
          version: 1,
          sameDayHitService: true,
          saturdayDelivery: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      replaceCartItems,
      restoreCheckoutPreferences,
      applyValidatedDiscount: vi.fn(),
    });

    expect(outcome).toMatchObject({ ok: true, status: 'restored', discountStatus: 'none' });
    expect(replaceCartItems).toHaveBeenCalledWith([recoveredItem]);
    expect(restoreCheckoutPreferences).toHaveBeenCalledWith({
      sameDayHitService: true,
      saturdayDelivery: true,
    });
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

  it('removes a fragment recovery credential while preserving ordinary navigation state', () => {
    const replaceState = vi.fn();
    const result = clearAbandonedCartRecoveryQuery({
      locationHref: 'https://banners.example/checkout?keep=1#recovery=signed.token&view=payment',
      replaceState,
    });
    expect(result).toBe('/checkout?keep=1#view=payment');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/checkout?keep=1#view=payment');
  });

  it('preserves a plain anchor when a fragment recovery credential is scrubbed', () => {
    const replaceState = vi.fn();
    const result = clearAbandonedCartRecoveryQuery({
      locationHref: 'https://banners.example/checkout#section&recovery=',
      replaceState,
    });
    expect(result).toBe('/checkout#section');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/checkout#section');
  });

  it('escrows a bounded fragment token before scrubbing and can clear it after resolution', () => {
    const storage = memoryStorage();
    const nowMs = Date.parse('2026-09-01T12:00:00.000Z');
    const token = expiringRecoveryToken(Math.floor(nowMs / 1000) + 3600);

    expect(prepareAbandonedCartRecoveryToken({
      locationHref: `https://banners.example/checkout#section&recovery=${token}`,
      storage,
      nowMs,
    })).toBe(token);
    expect(readStoredAbandonedCartRecoveryRetryToken(storage, nowMs)).toBe(token);
    expect(isAbandonedCartRecoveryTokenRetryable(token, nowMs)).toBe(true);

    clearStoredAbandonedCartRecoveryRetryToken(storage);
    expect(storage.getItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY)).toBeNull();
  });

  it('never persists query credentials and purges expired fragment escrow', () => {
    const storage = memoryStorage();
    const nowMs = Date.parse('2026-09-01T12:00:00.000Z');
    const token = expiringRecoveryToken(Math.floor(nowMs / 1000) + 60);

    expect(prepareAbandonedCartRecoveryToken({
      locationHref: `https://banners.example/checkout?recovery=${token}`,
      storage,
      nowMs,
    })).toBe(token);
    expect(storage.getItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY)).toBeNull();

    prepareAbandonedCartRecoveryToken({
      locationHref: `https://banners.example/checkout#recovery=${token}`,
      storage,
      nowMs,
    });
    expect(readStoredAbandonedCartRecoveryRetryToken(storage, nowMs + 61_000)).toBeNull();
    expect(storage.getItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY)).toBeNull();
  });

  it('purges malformed or implausibly long-lived fragment credentials from retry storage', () => {
    const storage = memoryStorage();
    const nowMs = Date.parse('2026-09-01T12:00:00.000Z');
    const tooLongLived = expiringRecoveryToken(Math.floor(nowMs / 1000) + (8 * 24 * 60 * 60));

    expect(prepareAbandonedCartRecoveryToken({
      locationHref: `https://banners.example/checkout#recovery=${tooLongLived}`,
      storage,
      nowMs,
    })).toBe(tooLongLived);
    expect(readStoredAbandonedCartRecoveryRetryToken(storage, nowMs)).toBeNull();
    expect(isAbandonedCartRecoveryTokenRetryable('not-a-token', nowMs)).toBe(false);
  });

  it('purges retry state whose stored expiry does not match the embedded claim', () => {
    const storage = memoryStorage();
    const nowMs = Date.parse('2026-09-01T12:00:00.000Z');
    const embeddedExpiry = Math.floor(nowMs / 1000) + 3600;
    const token = expiringRecoveryToken(embeddedExpiry);
    storage.setItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY, JSON.stringify({
      token,
      expiresAt: embeddedExpiry + 1,
    }));

    expect(readStoredAbandonedCartRecoveryRetryToken(storage, nowMs)).toBeNull();
    expect(storage.getItem(ABANDONED_CART_RECOVERY_RETRY_STORAGE_KEY)).toBeNull();
  });
});
