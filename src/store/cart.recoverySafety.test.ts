import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cartSyncMock = vi.hoisted(() => ({
  userId: 'customer-1' as string | null,
  loadCart: vi.fn(),
  saveCart: vi.fn(async () => true),
}));

vi.mock('@/lib/cartSync', () => ({
  cartSync: {
    getUserId: () => cartSyncMock.userId,
    getSessionId: () => 'test-session',
    loadCart: cartSyncMock.loadCart,
    saveCart: cartSyncMock.saveCart,
  },
}));
vi.mock('@/lib/analytics', () => ({ trackAddToCart: vi.fn(), trackFBAddToCart: vi.fn() }));

import {
  beginStartupCartRecovery,
  resetStartupCartRecoveryForTests,
} from '@/lib/cartRecoveryStartup';
import { useCartStore, type CartItem } from './cart';

const cartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'recovered-banner',
  product_type: 'banner',
  width_in: 72,
  height_in: 36,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rope_feet: 0,
  area_sqft: 18,
  unit_price_cents: 10_000,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 10_000,
  ...overrides,
});

describe('cart recovery safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStartupCartRecoveryForTests();
    cartSyncMock.userId = 'customer-1';
    cartSyncMock.loadCart.mockReset();
    cartSyncMock.saveCart.mockClear();
    useCartStore.setState({
      items: [cartItem()],
      isLoading: false,
      isSyncing: false,
      discountCode: null,
      sameDayHitService: false,
      saturdayDelivery: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStartupCartRecoveryForTests();
  });

  it('does not start account hydration while signed recovery owns startup', async () => {
    beginStartupCartRecovery();
    await useCartStore.getState().loadFromServer();

    expect(cartSyncMock.loadCart).not.toHaveBeenCalled();
    expect(useCartStore.getState().items.map((item) => item.id)).toEqual(['recovered-banner']);
  });

  it('discards an account cart response that resolves after recovery begins', async () => {
    let resolveLoad!: (items: CartItem[]) => void;
    cartSyncMock.loadCart.mockImplementation(() => new Promise<CartItem[]>((resolve) => {
      resolveLoad = resolve;
    }));
    const loading = useCartStore.getState().loadFromServer();
    beginStartupCartRecovery();
    resolveLoad([cartItem({ id: 'stale-account-banner' })]);
    await loading;

    expect(useCartStore.getState().items.map((item) => item.id)).toEqual(['recovered-banner']);
  });

  it('restores same-day only when the current window and recovered items are eligible', () => {
    vi.setSystemTime(new Date('2026-09-07T14:00:00.000Z')); // Monday, 10:00 AM ET
    const restored = useCartStore.getState().restoreRecoveredCheckoutPreferences({
      sameDayHitService: true,
      saturdayDelivery: true,
    });

    expect(restored).toEqual({ sameDayHitService: true, saturdayDelivery: false });
    expect(useCartStore.getState()).toMatchObject({
      sameDayHitService: true,
      saturdayDelivery: false,
    });
  });

  it('leaves both recovered delivery options off after the ET cutoff', () => {
    vi.setSystemTime(new Date('2026-09-07T18:00:00.000Z')); // Monday, 2:00 PM ET
    expect(useCartStore.getState().restoreRecoveredCheckoutPreferences({
      sameDayHitService: true,
      saturdayDelivery: true,
    })).toEqual({ sameDayHitService: false, saturdayDelivery: false });
  });

  it('leaves both recovered delivery options off for an ineligible cart', () => {
    vi.setSystemTime(new Date('2026-09-07T14:00:00.000Z')); // Monday, 10:00 AM ET
    useCartStore.setState({ items: [cartItem({ product_type: 'poster' })] });

    expect(useCartStore.getState().restoreRecoveredCheckoutPreferences({
      sameDayHitService: true,
      saturdayDelivery: true,
    })).toEqual({ sameDayHitService: false, saturdayDelivery: false });
  });

  it('restores Saturday delivery only during an eligible Friday window', () => {
    vi.setSystemTime(new Date('2026-09-04T14:00:00.000Z')); // Friday, 10:00 AM ET
    expect(useCartStore.getState().restoreRecoveredCheckoutPreferences({
      sameDayHitService: true,
      saturdayDelivery: true,
    })).toEqual({ sameDayHitService: true, saturdayDelivery: true });
  });
});
