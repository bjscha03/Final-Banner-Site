import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets } from './quote';
import { calculateTax, calculateTotalWithTax, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';

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
  unit_price_cents: number;
  line_total_cents: number;
  file_key?: string;
  file_name?: string;
  file_url?: string;
  created_at: string;
}

export interface CartState {
  items: CartItem[];
  addFromQuote: (quote: QuoteState) => void;
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
      
      addFromQuote: (quote: QuoteState) => {
        const area = (quote.widthIn * quote.heightIn) / 144;
        const pricePerSqFt = {
          '13oz': 4.5,
          '15oz': 6.0,
          '18oz': 7.5,
          'mesh': 6.0
        }[quote.material];

        const unitPriceCents = Math.round(area * pricePerSqFt * 100);
        const ropeFeet = quote.addRope ? quote.widthIn / 12 : 0;
        const ropeCostCents = Math.round(ropeFeet * 2 * quote.quantity * 100);

        // Calculate pole pocket cost
        const polePocketCostCents = (() => {
          if (quote.polePockets === 'none') return 0;

          const setupFee = 15.00;
          const pricePerLinearFoot = 2.00;

          let linearFeet = 0;
          switch (quote.polePockets) {
            case 'top':
            case 'bottom':
              linearFeet = quote.widthIn / 12;
              break;
            case 'left':
            case 'right':
              linearFeet = quote.heightIn / 12;
              break;
            case 'top-bottom':
              linearFeet = (quote.widthIn / 12) * 2;
              break;
            default:
              linearFeet = 0;
          }

          return Math.round((setupFee + (linearFeet * pricePerLinearFoot * quote.quantity)) * 100);
        })();

        const lineTotalCents = unitPriceCents * quote.quantity + ropeCostCents + polePocketCostCents;
        
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
          unit_price_cents: unitPriceCents,
          line_total_cents: lineTotalCents,
          file_key: quote.file?.name,
          file_name: quote.file?.name,
          file_url: quote.file?.url,
          created_at: new Date().toISOString(),
        };
        
        set((state) => ({
          items: [...state.items, newItem]
        }));
      },
      
      updateQuantity: (id: string, quantity: number) => {
        set((state) => ({
          items: state.items.map(item => 
            item.id === id 
              ? { 
                  ...item, 
                  quantity,
                  line_total_cents: Math.round((item.unit_price_cents * quantity) + (item.rope_feet * 2 * quantity * 100))
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
