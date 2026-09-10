import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  return { storage, commerceUserId: null as string | null };
});
vi.mock('@/lib/cartSync', () => ({ cartSync: {
  getUserId: () => testState.commerceUserId,
  getSessionId: () => 'test-guest-session',
  saveCart: vi.fn(async () => true),
  loadCart: vi.fn(async () => []),
} }));
vi.mock('@/lib/analytics', () => ({ trackAddToCart: vi.fn(), trackFBAddToCart: vi.fn() }));
import { useCartStore } from './cart';

const customer = '11111111-1111-4111-8111-111111111111';
const otherCustomer = '22222222-2222-4222-8222-222222222222';
const item = { id: 'qa-artwork', product_type: 'banner', width_in: 72, height_in: 36, quantity: 1, material: '13oz', grommets: 'none', pole_pockets: 'none', rope_feet: 0, area_sqft: 18, unit_price_cents: 8100, line_total_cents: 8100, rope_cost_cents: 0, pole_pocket_cost_cents: 0 };

describe('cart persistence ownership on reload', () => {
  beforeEach(() => {
    testState.storage.clear();
    testState.commerceUserId = null;
    useCartStore.setState({ items: [], discountCode: null });
  });
  it.each([
    ['standalone admin guest cart', null, null, 'server-admin', true],
    ['ordinary guest cart', null, null, null, true],
    ['same customer cart', customer, customer, customer, true],
    ['different customer cart', customer, otherCustomer, customer, false],
    ['unowned cart with customer login', customer, null, customer, false],
  ] as const)('handles %s safely', async (_name, commerceUserId, owner, loginId, retained) => {
    testState.commerceUserId = commerceUserId;
    if (loginId) testState.storage.setItem('banners_current_user', JSON.stringify({ id: loginId, is_admin: loginId === 'server-admin' }));
    if (owner) testState.storage.setItem('cart_owner_user_id', owner);
    testState.storage.setItem('cart-storage', JSON.stringify({ state: { items: [item], _cartOwnerId: owner }, version: 0 }));
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().items.map(entry => entry.id)).toEqual(retained ? ['qa-artwork'] : []);
  });
});
