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
  pole_pocket_cost_cents: number;  area_sqft: number;
  unit_price_cents: number;
  line_total_cents: number;
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

export interface CartState {
  items: CartItem[];
  addFromQuote: (quote: QuoteState, aiMetadata?: any) => void;
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
      
      addFromQuote: (quote: QuoteState, aiMetadata?: any) => {
        console.log("DEBUG: addFromQuote called with addRope:", quote.addRope);
        console.log("DEBUG: quote.material:", quote.material);        const area = (quote.widthIn * quote.heightIn) / 144;
        console.log("DEBUG: area:", area);        const pricePerSqFt = {
          '13oz': 4.5,
          '15oz': 6.0,
          '18oz': 7.5,
          'mesh': 6.0
        }[quote.material];
        console.log("DEBUG: pricePerSqFt:", pricePerSqFt);
        const unitPriceCents = Math.round(area * (pricePerSqFt || 4.5) * 100); // Fallback to 13oz price if material not found
        console.log("DEBUG: unitPriceCents:", unitPriceCents);        const ropeFeet = quote.addRope ? quote.widthIn / 12 : 0;
        const ropeCostCents = Math.round(ropeFeet * 2 * quote.quantity * 100);
        console.log("DEBUG: Rope calculation - ropeFeet:", ropeFeet, "ropeCostCents:", ropeCostCents);
        
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

          return Math.round((setupFee + (linearFeet * pricePerLinearFoot)) * quote.quantity * 100);
        })();

        const lineTotalCents = unitPriceCents * quote.quantity + ropeCostCents + polePocketCostCents;
        
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
          pole_pocket_cost_cents: polePocketCostCents,
          area_sqft: area,
          unit_price_cents: unitPriceCents,
          line_total_cents: lineTotalCents,
          file_key: fileKey,
          file_name: quote.file?.name,
          file_url: quote.file?.url,
          created_at: new Date().toISOString(),
          ...(aiMetadata || {}),
        };
        
        console.log("🛒 CART STORE DEBUG - Adding item:", {
          id: newItem.id,
          line_total_cents: newItem.line_total_cents,
          typeof_line_total: typeof newItem.line_total_cents,
          calculated_value: lineTotalCents
        });        
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
                  // Keep pole_pocket_cost_cents in sync with quantity so the UI breakdown stays correct
                  pole_pocket_cost_cents: (() => {
                    const setupFeeCents = 1500;
                    const pricePerLinearFootCents = 200;
                    let linearFeet = 0;
                    switch (item.pole_pockets) {
                      case 'top':
                      case 'bottom':
                        linearFeet = item.width_in / 12;
                        break;
                      case 'left':
                      case 'right':
                        linearFeet = item.height_in / 12;
                        break;
                      case 'top-bottom':
                        linearFeet = (item.width_in / 12) * 2;
                        break;
                      default:
                        linearFeet = 0;
                    }
                    return (item.pole_pockets && item.pole_pockets !== 'none')
                      ? Math.round((setupFeeCents + linearFeet * pricePerLinearFootCents) * quantity)
                      : 0;
                  })(),
                  line_total_cents: (() => {
                    // Recompute from first principles for new quantity
                    const baseCost = item.unit_price_cents * quantity;
                    const ropeCost = item.rope_feet * 2 * quantity * 100;

                    // Pole pocket cost: setup fee + linear feet priced, all scaled by quantity
                    const setupFeeCents = 1500; // $15 setup fee per line item
                    const pricePerLinearFootCents = 200; // $2.00 per linear foot
                    let linearFeet = 0;
                    switch (item.pole_pockets) {
                      case 'top':
                      case 'bottom':
                        linearFeet = item.width_in / 12;
                        break;
                      case 'left':
                      case 'right':
                        linearFeet = item.height_in / 12;
                        break;
                      case 'top-bottom':
                        linearFeet = (item.width_in / 12) * 2;
                        break;
                      default:
                        linearFeet = 0;
                    }
                    const polePocketCostCents = (item.pole_pockets && item.pole_pockets !== 'none')
                      ? Math.round((setupFeeCents + linearFeet * pricePerLinearFootCents) * quantity)
                      : 0;

                    return Math.round(baseCost + ropeCost + polePocketCostCents);
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
