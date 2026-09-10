import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from './cart';

vi.mock('@/lib/cartSync', () => ({
  cartSync: {
    getUserId: () => null,
    getSessionId: () => 'test-session',
    saveCart: vi.fn(async () => true),
    loadCart: vi.fn(async () => []),
  },
}));
vi.mock('@/lib/analytics', () => ({ trackAddToCart: vi.fn(), trackFBAddToCart: vi.fn() }));

describe('cart rope placement fallbacks', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], discountCode: null, sameDayHitService: false, saturdayDelivery: false });
  });

  it('prices and stores top-and-bottom rope when authoritative pricing is absent', () => {
    const quote: any = {
      widthIn: 48,
      heightIn: 24,
      quantity: 2,
      material: '13oz',
      grommets: 'none',
      polePockets: 'none',
      polePocketSize: '2',
      addRope: true,
      ropePlacement: 'top-bottom',
      product_type: 'banner',
    };

    useCartStore.getState().addFromQuote(quote);
    const [item] = useCartStore.getState().items;
    expect(item.rope_placement).toBe('top-bottom');
    expect(item.rope_feet).toBe(8);
    expect(item.rope_cost_cents).toBe(3200);
    expect(item.line_total_cents).toBe(10400);
  });

  it('preserves top-and-bottom rope math when a legacy zero-priced item migrates', () => {
    useCartStore.setState({
      items: [{
        id: 'legacy-rope',
        product_type: 'banner',
        width_in: 48,
        height_in: 24,
        quantity: 2,
        material: '13oz',
        grommets: 'none',
        pole_pockets: 'none',
        rope_feet: 8,
        rope_placement: 'top-bottom',
        area_sqft: 8,
        unit_price_cents: 0,
        rope_cost_cents: 0,
        pole_pocket_cost_cents: 0,
        line_total_cents: 0,
      } as any],
    });

    const [migrated] = useCartStore.getState().getMigratedItems();
    expect(migrated.rope_placement).toBe('top-bottom');
    expect(migrated.rope_feet).toBe(8);
    expect(migrated.rope_cost_cents).toBe(3200);
    expect(migrated.line_total_cents).toBe(10400);
  });
});
