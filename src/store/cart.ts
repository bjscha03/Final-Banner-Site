import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets } from './quote';
import { 
  computeCartTotals, 
  formatMoney,
  roundToCents,
  type Cart,
  type CartItem,
  type CartOption,
  type MoneyCents,
  type CartTotals
} from '@/lib/cart-pricing';

// Legacy CartItem interface for migration
export interface LegacyCartItem {
  id: string;
  width_in: number;
  height_in: number;
  quantity: number;
  material: MaterialKey;
  grommets: Grommets;
  pole_pockets: string;
  rope_feet: number;
  pole_pocket_cost_cents: number;
  area_sqft: number;
  unit_price_cents: number;
  line_total_cents: number;
  file_key?: string;
  file_name?: string;
  file_url?: string;
  aiDesign?: any;
  created_at: string;
}

export interface CartState {
  // Core cart data using new schema
  cart: Cart;
  
  // Actions
  addFromQuote: (quote: QuoteState, aiMetadata?: any) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  
  // Computed values using single source of truth
  getTotals: () => CartTotals;
  getSubtotalCents: () => number;
  getTaxCents: () => number;
  getTotalCents: () => number;
  getItemCount: () => number;
  
  // Migration helper
  migrateLegacyItems: (legacyItems: LegacyCartItem[]) => void;
}

/**
 * Convert QuoteState to new CartItem with proper options
 */
const createCartItemFromQuote = (quote: QuoteState, aiMetadata?: any): CartItem => {
  const area = (quote.widthIn * quote.heightIn) / 144;
  const pricePerSqFt = {
    '13oz': 4.5,
    '15oz': 6.0,
    '18oz': 7.5,
    'mesh': 6.0
  }[quote.material] || 4.5;
  
  const unitPriceCents = roundToCents(area * pricePerSqFt * 100);
  const title = `Custom Banner ${quote.widthIn}" x ${quote.heightIn}"`;
  const sku = `banner-${quote.widthIn}x${quote.heightIn}-${quote.material}`;
  
  const options: CartOption[] = [];
  
  // Add rope option if selected
  if (quote.addRope) {
    const ropeFeet = quote.widthIn / 12;
    options.push({
      id: 'rope',
      name: `Rope: ${ropeFeet.toFixed(1)}ft`,
      priceCents: roundToCents(ropeFeet * 2 * 100), // $2 per foot
      pricingMode: 'per_item',
      quantityPerItem: 1,
    });
  }
  
  // Add pole pocket option if selected
  if (quote.polePockets !== 'none') {
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
    }
    
    const polePocketCost = setupFee + (linearFeet * pricePerLinearFoot);
    options.push({
      id: 'pole_pockets',
      name: `Pole Pockets: ${quote.polePockets}`,
      priceCents: roundToCents(polePocketCost * 100),
      pricingMode: 'per_item', // Per item for now, can be changed to per_order if needed
      quantityPerItem: 1,
    });
  }
  
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sku,
    title,
    unitPriceCents,
    qty: quote.quantity,
    options,
  };
};

/**
 * Migrate legacy cart item to new schema
 */
const migrateLegacyCartItem = (legacyItem: LegacyCartItem): CartItem => {
  const title = `Custom Banner ${legacyItem.width_in}" x ${legacyItem.height_in}"`;
  const sku = `banner-${legacyItem.width_in}x${legacyItem.height_in}-${legacyItem.material}`;
  
  const options: CartOption[] = [];
  
  // Add rope option if present
  if (legacyItem.rope_feet > 0) {
    options.push({
      id: 'rope',
      name: `Rope: ${legacyItem.rope_feet}ft`,
      priceCents: roundToCents(legacyItem.rope_feet * 2 * 100), // $2 per foot
      pricingMode: 'per_item',
      quantityPerItem: 1,
    });
  }
  
  // Add pole pocket option if present
  if (legacyItem.pole_pocket_cost_cents > 0) {
    options.push({
      id: 'pole_pockets',
      name: `Pole Pockets: ${legacyItem.pole_pockets}`,
      priceCents: legacyItem.pole_pocket_cost_cents,
      pricingMode: 'per_item',
      quantityPerItem: 1,
    });
  }
  
  return {
    id: legacyItem.id,
    sku,
    title,
    unitPriceCents: legacyItem.unit_price_cents,
    qty: legacyItem.quantity,
    options,
  };
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: {
        items: [],
        shippingCents: 0, // FREE shipping
        taxRatePct: 6, // 6% tax rate
        discountsCents: 0,
      },
      
      addFromQuote: (quote: QuoteState, aiMetadata?: any) => {
        const newItem = createCartItemFromQuote(quote, aiMetadata);
        
        set((state) => ({
          cart: {
            ...state.cart,
            items: [...state.cart.items, newItem]
          }
        }));
      },
      
      updateQuantity: (id: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        
        set((state) => ({
          cart: {
            ...state.cart,
            items: state.cart.items.map(item => 
              item.id === id ? { ...item, qty: quantity } : item
            )
          }
        }));
      },
      
      removeItem: (id: string) => {
        set((state) => ({
          cart: {
            ...state.cart,
            items: state.cart.items.filter(item => item.id !== id)
          }
        }));
      },
      
      clearCart: () => {
        set((state) => ({
          cart: {
            ...state.cart,
            items: []
          }
        }));
      },
      
      getTotals: () => {
        const state = get();
        if (!state.cart || !state.cart.items) {
          return {
            itemTotals: [],
            subtotalCents: 0,
            discountsCents: 0,
            subtotalAfterDiscountsCents: 0,
            taxCents: 0,
            shippingCents: 0,
            totalCents: 0,
          };
        }
        return computeCartTotals(state.cart);
      },      
      getSubtotalCents: () => {
        return get().getTotals().subtotalCents;
      },
      
      getTaxCents: () => {
        return get().getTotals().taxCents;
      },
      
      getTotalCents: () => {
        return get().getTotals().totalCents;
      },
      
      getItemCount: () => {
        return get().cart.items.reduce((sum, item) => sum + item.qty, 0);
      },
      
      migrateLegacyItems: (legacyItems: LegacyCartItem[]) => {
        const migratedItems = legacyItems.map(migrateLegacyCartItem);
        set((state) => ({
          cart: {
            ...state.cart,
            items: migratedItems
          }
        }));
      },
    }),
    {
      name: 'cart-storage',
      version: 2, // Increment version to trigger migration
      migrate: (persistedState: any, version: number) => {
        if (!persistedState) {
          return {
            cart: {
              items: [],
              shippingCents: 0,
              taxRatePct: 6,
              discountsCents: 0,
            }
          };
        }        if (version < 2) {
          // Migrate from legacy cart structure
          const legacyItems = persistedState?.items || [];
          const migratedItems = legacyItems.map(migrateLegacyCartItem);
          
          return {
            cart: {
              items: migratedItems,
              shippingCents: 0,
              taxRatePct: 6,
              discountsCents: 0,
            }
          };
        }
        return persistedState;
      },
    }
  )
);
