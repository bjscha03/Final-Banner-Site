import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets } from './quote';
import { calculateTax, calculateTotalWithTax, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';

export type PricingMode = 'per_item' | 'per_order';

export interface CartItem {
  id: string;
  width_in: number;
  height_in: number;
  quantity: number;
  material: MaterialKey;
  grommets: Grommets;
  pole_pockets: string;
  rope_feet: number;
  area_sqft: number;

  // Authoritative pricing fields captured at Add to Cart time
  unit_price_cents: number;           // base banner price per item
  rope_cost_cents: number;            // total rope cost for this line item
  rope_pricing_mode?: PricingMode;    // default 'per_item'
  pole_pocket_cost_cents: number;     // total pole pocket cost for this line item
  pole_pocket_pricing_mode?: PricingMode; // default 'per_item'
  line_total_cents: number;           // authoritative line total

  file_key?: string;
  file_name?: string;
  file_url?: string;
  // AI Design metadata (optional)
  aiDesign?: {
    prompt: string;
    styles: string[];
    colors: string[];
    size: { wIn: number; hIn: number };
    material: string;
    options: {
      grommets: string;
      polePockets: string;
      addRope: boolean;
    };
    ai: {
      provider: string;
      seed?: number;
      draftPublicId: string;
    };
    layers: {
      headline?: string;
      subheadline?: string;
      cta?: string;
    };
    assets: {
      proofUrl: string;
      finalUrl?: string;
    };
  };
  created_at: string;
}

export interface AuthoritativePricing {
  unit_price_cents: number;
  rope_cost_cents: number;
  rope_pricing_mode?: PricingMode;
  pole_pocket_cost_cents: number;
  pole_pocket_pricing_mode?: PricingMode;
  line_total_cents: number;
}

export interface CartState {
  items: CartItem[];
  addFromQuote: (quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getSubtotalCents: () => number;
  getTaxCents: () => number;
  getTotalCents: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addFromQuote: (quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => {
        // Capture design-page authoritative pricing when provided
        const usingAuthoritative = !!pricing;

        // Compute fallbacks if not provided
        const area = (quote.widthIn * quote.heightIn) / 144;
        const pricePerSqFt = ({ '13oz': 4.5, '15oz': 6.0, '18oz': 7.5, 'mesh': 6.0 } as Record<MaterialKey, number>)[quote.material];
        const computedUnit = Math.round(area * (pricePerSqFt ?? 4.5) * 100);
        const ropeFeet = quote.addRope ? quote.widthIn / 12 : 0;
        const computedRope = Math.round(ropeFeet * 2 * quote.quantity * 100);
        const computedPole = (() => {
          if (quote.polePockets === 'none') return 0;
          const setupFee = 1500; // cents
          const pricePerLinearFoot = 200; // cents
          let linearFeet = 0;
          switch (quote.polePockets) {
            case 'top':
            case 'bottom':
              linearFeet = quote.widthIn / 12; break;
            case 'left':
            case 'right':
              linearFeet = quote.heightIn / 12; break;
            case 'top-bottom':
              linearFeet = (quote.widthIn / 12) * 2; break;
            default:
              linearFeet = 0;
          }
          return Math.round((setupFee + (linearFeet * pricePerLinearFoot)) * quote.quantity);
        })();
        const computedLine = computedUnit * quote.quantity + computedRope + computedPole;

        const unit_price_cents = pricing?.unit_price_cents ?? computedUnit;
        const rope_cost_cents = pricing?.rope_cost_cents ?? computedRope;
        const rope_pricing_mode: PricingMode = pricing?.rope_pricing_mode ?? 'per_item';
        const pole_pocket_cost_cents = pricing?.pole_pocket_cost_cents ?? computedPole;
        const pole_pocket_pricing_mode: PricingMode = pricing?.pole_pocket_pricing_mode ?? 'per_item';
        const line_total_cents = pricing?.line_total_cents ?? computedLine;

        // Use the file key from the uploaded file
        const fileKey = quote.file?.fileKey;

        const newItem: CartItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          width_in: quote.widthIn,
          height_in: quote.heightIn,
          quantity: quote.quantity,
          material: quote.material,
          grommets: quote.grommets,
          pole_pockets: quote.polePockets,
          rope_feet: ropeFeet,
          area_sqft: area,
          unit_price_cents,
          rope_cost_cents,
          rope_pricing_mode,
          pole_pocket_cost_cents,
          pole_pocket_pricing_mode,
          line_total_cents,
          file_key: fileKey,
          file_name: quote.file?.name,
          file_url: quote.file?.url,
          created_at: new Date().toISOString(),
          ...(aiMetadata || {}),
        };

        console.log('🧮 CART: addFromQuote', { usingAuthoritative, pricing, computed: { unit: computedUnit, rope: computedRope, pole: computedPole, line: computedLine }, stored: newItem });
        set((state) => ({ items: [...state.items, newItem] }));
      },
      
      updateQuantity: (id: string, quantity: number) => {
        set((state) => ({
          items: state.items.map(item => 
            item.id === id 
              ? { 
                  ...item, 
                  quantity,
                  // Recompute option totals using stored pricing modes; keep math consistent with design page
                  rope_cost_cents: item.rope_pricing_mode === 'per_order'
                    ? item.rope_cost_cents
                    : Math.round((item.rope_cost_cents / Math.max(1, item.quantity)) * quantity),
                  pole_pocket_cost_cents: item.pole_pocket_pricing_mode === 'per_order'
                    ? item.pole_pocket_cost_cents
                    : Math.round((item.pole_pocket_cost_cents / Math.max(1, item.quantity)) * quantity),
                  line_total_cents: (() => {
                    const perOrderRope = item.rope_pricing_mode === 'per_order' ? item.rope_cost_cents : 0;
                    const perOrderPockets = item.pole_pocket_pricing_mode === 'per_order' ? item.pole_pocket_cost_cents : 0;
                    const perItemRope = item.rope_pricing_mode === 'per_item' ? Math.round((item.rope_cost_cents / Math.max(1, item.quantity)) * quantity) : 0;
                    const perItemPockets = item.pole_pocket_pricing_mode === 'per_item' ? Math.round((item.pole_pocket_cost_cents / Math.max(1, item.quantity)) * quantity) : 0;
                    const baseCost = item.unit_price_cents * quantity;
                    return Math.round(baseCost + perOrderRope + perOrderPockets + perItemRope + perItemPockets);
                  })()
                }
              : item
          )
        }));
      },
      
      removeItem: (id: string) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== id)
        }));
      },
      
      clearCart: () => {
        set({ items: [] });
      },
      
      getSubtotalCents: () => {
        const flags = getFeatureFlags();
        const items = get().items;

        if (flags.freeShipping || flags.minOrderFloor) {
          const pricingOptions = getPricingOptions();
          const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
          const totals = computeTotals(pricingItems, 0.06, pricingOptions);
          return totals.adjusted_subtotal_cents;
        }

        return items.reduce((total, item) => total + item.line_total_cents, 0);
      },

      getTaxCents: () => {
        const flags = getFeatureFlags();
        const items = get().items;

        if (flags.freeShipping || flags.minOrderFloor) {
          const pricingOptions = getPricingOptions();
          const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
          const totals = computeTotals(pricingItems, 0.06, pricingOptions);
          return totals.tax_cents;
        }

        const subtotal = get().getSubtotalCents();
        return Math.round(calculateTax(subtotal / 100) * 100);
      },

      getTotalCents: () => {
        const flags = getFeatureFlags();
        const items = get().items;

        if (flags.freeShipping || flags.minOrderFloor) {
          const pricingOptions = getPricingOptions();
          const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
          const totals = computeTotals(pricingItems, 0.06, pricingOptions);
          return totals.total_cents;
        }

        const subtotal = get().getSubtotalCents();
        return Math.round(calculateTotalWithTax(subtotal / 100) * 100);
      },

      getItemCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      }
    }),
    {
      name: 'cart-storage',
    }
  )
);
