import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore, type CanonicalCartQuote } from './cart';

vi.mock('@/lib/cartSync', () => ({
  cartSync: {
    getUserId: () => null,
    getSessionId: () => 'test-session',
    saveCart: vi.fn(async () => true),
    loadCart: vi.fn(async () => []),
  },
}));
vi.mock('@/lib/analytics', () => ({ trackAddToCart: vi.fn(), trackFBAddToCart: vi.fn() }));

const item = {
  id: 'cart-1',
  product_type: 'banner',
  width_in: 48,
  height_in: 24,
  quantity: 2,
  material: '13oz',
  grommets: 'none',
  pole_pockets: 'none',
  rope_feet: 4,
  rope_placement: 'top',
  area_sqft: 8,
  unit_price_cents: 3600,
  rope_cost_cents: 1600,
  pole_pocket_cost_cents: 0,
  line_total_cents: 8800,
} as any;

describe('canonical stale-cart quote application', () => {
  beforeEach(() => useCartStore.setState({
    items: [item],
    discountCode: null,
    sameDayHitService: false,
    saturdayDelivery: false,
  }));

  it('updates only exact-bound authoritative price fields', () => {
    const quote: CanonicalCartQuote = {
      items: [{
        index: 0,
        cartItemId: 'cart-1',
        productType: 'banner',
        unitPriceCents: 3600,
        lineTotalCents: 10400,
        ropeFeet: 8,
        ropeCostCents: 3200,
        polePocketCostCents: 0,
      }],
      subtotalCents: 10400,
      taxCents: 593,
      shippingCents: 0,
      totalCents: 10473,
      appliedDiscountCents: 520,
      appliedDiscountType: 'quantity',
      discountCode: null,
    };

    expect(useCartStore.getState().applyCanonicalPricingQuote(quote)).toBe(true);
    expect(useCartStore.getState().items[0]).toMatchObject({
      id: 'cart-1',
      rope_placement: 'top',
      rope_feet: 8,
      rope_cost_cents: 3200,
      line_total_cents: 10400,
    });
  });

  it('rejects a quote whose cart identity does not match', () => {
    const quote = {
      items: [{ index: 0, cartItemId: 'different-cart', productType: 'banner', unitPriceCents: 1, lineTotalCents: 1, ropeFeet: 0, ropeCostCents: 0, polePocketCostCents: 0 }],
    } as CanonicalCartQuote;
    expect(useCartStore.getState().applyCanonicalPricingQuote(quote)).toBe(false);
    expect(useCartStore.getState().items[0].line_total_cents).toBe(8800);
  });

  it('rejects a canonical promo amount that the current promo definition cannot reproduce', () => {
    useCartStore.setState({
      discountCode: {
        id: 'promo-20',
        code: 'SAVE',
        discountPercentage: 20,
        discountAmountCents: null,
        expiresAt: '2099-12-31T23:59:59Z',
      },
    });
    const quote: CanonicalCartQuote = {
      items: [{
        index: 0,
        cartItemId: 'cart-1',
        productType: 'banner',
        unitPriceCents: 3600,
        lineTotalCents: 8800,
        ropeFeet: 4,
        ropeCostCents: 1600,
        polePocketCostCents: 0,
      }],
      subtotalCents: 8800,
      taxCents: 475,
      shippingCents: 0,
      totalCents: 8395,
      appliedDiscountCents: 880,
      appliedDiscountType: 'promo',
      discountCode: 'SAVE',
    };

    expect(useCartStore.getState().applyCanonicalPricingQuote(quote)).toBe(false);
  });

  it('does not partially mutate line prices when aggregate projection fails', () => {
    const quote: CanonicalCartQuote = {
      items: [{
        index: 0,
        cartItemId: 'cart-1',
        productType: 'banner',
        unitPriceCents: 4200,
        lineTotalCents: 10400,
        ropeFeet: 8,
        ropeCostCents: 3200,
        polePocketCostCents: 0,
      }],
      subtotalCents: 10400,
      taxCents: 624,
      shippingCents: 0,
      totalCents: 11024,
      appliedDiscountCents: 0,
      appliedDiscountType: 'none',
      discountCode: null,
    };

    expect(useCartStore.getState().applyCanonicalPricingQuote(quote)).toBe(false);
    expect(useCartStore.getState().items[0]).toMatchObject({
      unit_price_cents: 3600,
      line_total_cents: 8800,
      rope_feet: 4,
      rope_cost_cents: 1600,
    });
  });
});
