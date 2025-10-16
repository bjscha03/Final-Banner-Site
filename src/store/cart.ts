import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets, TextElement } from './quote';
import { calculateTax, calculateTotalWithTax, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { cartSync } from '@/lib/cartSync';

export type PricingMode = 'per_item' | 'per_order';

export interface CartItem {
  id: string;
  width_in: number;
  height_in: number;
  quantity: number;
  material: MaterialKey;
  grommets: Grommets;
  pole_pockets: string;
  pole_pocket_size?: string;          // pole pocket size (e.g., "2", "3", "4")
  pole_pocket_position?: string;      // pole pocket position (e.g., "top", "bottom", "top-bottom")
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
  web_preview_url?: string;            // Permanent Cloudinary URL for web preview (AI images)
  print_ready_url?: string;            // Permanent Cloudinary URL for print-ready file (AI images)
  is_pdf?: boolean;                    // Whether the file is a PDF
  text_elements?: TextElement[];      // Text layers added in design tool
  overlay_image?: {                   // Logo/graphic overlay
    name: string;
    url: string;
    fileKey: string;
    position: { x: number; y: number };
    scale: number;
    aspectRatio?: number;
  };
  // AI Design metadata (optional)
  image_scale?: number;                // Background image scale (for uploaded images)
  image_position?: { x: number; y: number }; // Background image position (for uploaded images)
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
  syncToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  items: CartItem[];
  addFromQuote: (quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => void;
  loadItemIntoQuote: (itemId: string) => CartItem | null;
  updateCartItem: (itemId: string, quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getSubtotalCents: () => number;
  getTaxCents: () => number;
  getTotalCents: () => number;
  getItemCount: () => number;
}

// Migration function to fix old cart items with missing or zero pricing fields
const migrateCartItem = (item: CartItem): CartItem => {
  // Check if this is an old item that needs migration
  const needsMigration = 
    item.line_total_cents === 0 || 
    item.line_total_cents === undefined || 
    item.unit_price_cents === 0 || 
    item.unit_price_cents === undefined;

  if (!needsMigration) {
    return item;
  }

  console.log('🔧 Migrating old cart item:', item.id);

  // Recompute pricing from scratch
  const area = item.area_sqft || (item.width_in * item.height_in) / 144;
  const pricePerSqFt = ({ '13oz': 4.5, '15oz': 6.0, '18oz': 7.5, 'mesh': 6.0 } as Record<MaterialKey, number>)[item.material];
  const unit_price_cents = Math.round(area * (pricePerSqFt ?? 4.5) * 100);

  // Compute rope cost
  const ropeFeet = item.rope_feet || 0;
  const rope_cost_cents = ropeFeet > 0 ? Math.round(ropeFeet * 2 * item.quantity * 100) : 0;

  // Compute pole pocket cost
  const pole_pocket_cost_cents = (() => {
    if (!item.pole_pockets || item.pole_pockets === 'none') return 0;
    const setupFee = 1500; // cents
    const pricePerLinearFoot = 200; // cents
    let linearFeet = 0;
    switch (item.pole_pockets) {
      case 'top':
      case 'bottom':
        linearFeet = item.width_in / 12; break;
      case 'left':
      case 'right':
        linearFeet = item.height_in / 12; break;
      case 'top-bottom':
        linearFeet = (item.width_in / 12) * 2; break;
      default:
        linearFeet = 0;
    }
    return Math.round((setupFee + (linearFeet * pricePerLinearFoot)) * item.quantity);
  })();

  // Compute line total
  const line_total_cents = unit_price_cents * item.quantity + rope_cost_cents + pole_pocket_cost_cents;

  const migratedItem = {
    ...item,
    unit_price_cents,
    rope_cost_cents,
    rope_pricing_mode: (item.rope_pricing_mode || 'per_item') as PricingMode,
    pole_pocket_cost_cents,
    pole_pocket_pricing_mode: (item.pole_pocket_pricing_mode || 'per_item') as PricingMode,
    line_total_cents,
  };

  console.log('✅ Migrated item:', {
    id: item.id,
    old: { unit: item.unit_price_cents, rope: item.rope_cost_cents, pole: item.pole_pocket_cost_cents, line: item.line_total_cents },
    new: { unit: unit_price_cents, rope: rope_cost_cents, pole: pole_pocket_cost_cents, line: line_total_cents }
  });

  return migratedItem;
};

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
          pole_pocket_size: quote.polePocketSize,
          pole_pocket_position: quote.polePockets,
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
          file_url: quote.file?.url || aiMetadata?.assets?.proofUrl || null,
          web_preview_url: aiMetadata?.assets?.proofUrl || null,
          print_ready_url: aiMetadata?.assets?.finalUrl || null,
          is_pdf: quote.file?.isPdf || false,
          text_elements: quote.textElements && quote.textElements.length > 0 ? quote.textElements : undefined,
          overlay_image: quote.overlayImage ? {
            ...quote.overlayImage,
            position: quote.overlayImage.position || { x: 50, y: 50 }
          } : undefined,
          image_scale: quote.imageScale || 1,
          image_position: quote.imagePosition || { x: 0, y: 0 },
          created_at: new Date().toISOString(),
          ...(aiMetadata || {}),
        };

        console.log('🧮 CART: addFromQuote', { usingAuthoritative, pricing, computed: { unit: computedUnit, rope: computedRope, pole: computedPole, line: computedLine }, stored: newItem });
        console.log('💾 CART STORAGE: Item added, will persist to localStorage');
        console.log('💾 CART STORAGE: Item added, will persist to localStorage');
        set((state) => ({ items: [...state.items, newItem] }));
      // Sync to Neon database
      setTimeout(() => get().syncToServer(), 100);
      },
      
      updateQuantity: (id: string, quantity: number) => {
        set((state) => ({
          items: state.items.map(item => {
            if (item.id !== id) return item;

            // Migrate old item if needed before updating quantity
            const migratedItem = migrateCartItem(item);

            return { 
              ...migratedItem, 
              quantity,
              // Recompute option totals using stored pricing modes; keep math consistent with design page
              rope_cost_cents: migratedItem.rope_pricing_mode === 'per_order'
                ? migratedItem.rope_cost_cents
                : Math.round((migratedItem.rope_cost_cents / Math.max(1, migratedItem.quantity)) * quantity),
              pole_pocket_cost_cents: migratedItem.pole_pocket_pricing_mode === 'per_order'
                ? migratedItem.pole_pocket_cost_cents
                : Math.round((migratedItem.pole_pocket_cost_cents / Math.max(1, migratedItem.quantity)) * quantity),
              line_total_cents: (() => {
                const perOrderRope = migratedItem.rope_pricing_mode === 'per_order' ? migratedItem.rope_cost_cents : 0;
                const perOrderPockets = migratedItem.pole_pocket_pricing_mode === 'per_order' ? migratedItem.pole_pocket_cost_cents : 0;
                const perItemRope = migratedItem.rope_pricing_mode === 'per_item' ? Math.round((migratedItem.rope_cost_cents / Math.max(1, migratedItem.quantity)) * quantity) : 0;
                const perItemPockets = migratedItem.rope_pricing_mode === 'per_item' ? Math.round((migratedItem.pole_pocket_cost_cents / Math.max(1, migratedItem.quantity)) * quantity) : 0;
                const baseCost = migratedItem.unit_price_cents * quantity;
                return Math.round(baseCost + perOrderRope + perOrderPockets + perItemRope + perItemPockets);
              })()
            };
          })
        }));
      // Sync to Neon database
      setTimeout(() => get().syncToServer(), 100);
      },
      
      loadItemIntoQuote: (itemId: string) => {
        const item = get().items.find(i => i.id === itemId);
        console.log('🛒 CART STORE: loadItemIntoQuote found item:', item);
        console.log('🛒 CART STORE: item.overlay_image:', item?.overlay_image);
        if (!item) return null;
        
        // Return the item so the caller can load it into quote store
        return item;
      },
      
      updateCartItem: (itemId: string, quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => {
        console.log('🔄 CART: updateCartItem called', { itemId, quote, pricing });
        
        // Find the existing item
        const existingItem = get().items.find(i => i.id === itemId);
        if (!existingItem) {
          console.error('❌ CART: Item not found:', itemId);
          return;
        }

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

        // Update the item with new data
        const updatedItem: CartItem = {
          ...existingItem,
          width_in: quote.widthIn,
          height_in: quote.heightIn,
          quantity: quote.quantity,
          material: quote.material,
          grommets: quote.grommets,
          pole_pockets: quote.polePockets,
          pole_pocket_size: quote.polePocketSize,
          pole_pocket_position: quote.polePockets,
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
          file_url: quote.file?.url || aiMetadata?.assets?.proofUrl || existingItem.file_url,
          web_preview_url: aiMetadata?.assets?.proofUrl || existingItem.web_preview_url,
          print_ready_url: aiMetadata?.assets?.finalUrl || existingItem.print_ready_url,
          is_pdf: quote.file?.isPdf || false,
          text_elements: quote.textElements && quote.textElements.length > 0 ? quote.textElements : undefined,
          overlay_image: quote.overlayImage ? {
            ...quote.overlayImage,
            position: quote.overlayImage.position || { x: 50, y: 50 }
          } : undefined,
          image_scale: quote.imageScale || 1,
          image_position: quote.imagePosition || { x: 0, y: 0 },
          ...(aiMetadata || {}),
        };

        console.log('✅ CART: updateCartItem success', { updatedItem });
        set((state) => ({
          items: state.items.map(item => item.id === itemId ? updatedItem : item)
        }));
      // Sync to Neon database
      setTimeout(() => get().syncToServer(), 100);
      },
      removeItem: (id: string) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== id)
        }));
      // Sync to Neon database
      setTimeout(() => get().syncToServer(), 100);
      },
      
      clearCart: () => {
        set({ items: [] });
      // Sync to Neon database
      setTimeout(() => get().syncToServer(), 100);
      },
      

      // Sync cart to Neon database (for logged-in users)
      syncToServer: async () => {
        const userId = cartSync.getUserId();
        if (!userId) {
          console.log('👤 No user logged in, skipping server sync');
          return;
        }
        
        const items = get().items;
        await cartSync.saveCart(userId, items);
      },

      // Load cart from Neon database and merge with local
      loadFromServer: async () => {
        console.log('🔵 STORE: loadFromServer called');
        const userId = cartSync.getUserId();
        console.log('🔵 STORE: Got user ID:', userId);
        
        if (!userId) {
          console.log('❌ STORE: No user logged in, skipping server load');
          return;
        }

        console.log('🔵 STORE: Loading cart from server (no merge)...');
        const serverItems = await cartSync.loadCart(userId);
        console.log('🔵 STORE: Server items count:', serverItems.length);
        console.log('🔵 STORE: Server items:', serverItems.map(i => ({ id: i.id, name: i.banner_name, quantity: i.quantity })));
        
        console.log('🔵 STORE: Replacing local cart with server cart...');
        set({ items: serverItems });
        console.log('🔵 STORE: Store updated with server items');
      },

      getSubtotalCents: () => {
        const flags = getFeatureFlags();
        const items = get().items.map(migrateCartItem); // Migrate items before calculating

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
        const items = get().items.map(migrateCartItem); // Migrate items before calculating

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
        const items = get().items.map(migrateCartItem); // Migrate items before calculating

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
      // Migrate items when loading from localStorage
      onRehydrateStorage: () => (state) => {
        console.log('�� CART STORAGE: Rehydrating from localStorage...');
        
        // SAFETY CHECK: DISABLED - useCartSync handles all cart clearing
        // This was causing duplicate clears and race conditions
        // useCartSync is the single source of truth for cart ownership
        console.log('💾 CART STORAGE: Rehydration complete, useCartSync will handle ownership');
        
        
        // Migrate cart items if needed
        if (state?.items) {
          console.log('💾 CART STORAGE: Found', state.items.length, 'items in storage');
          console.log('🔄 Rehydrating cart, checking for items needing migration...');
          const migratedItems = state.items.map(migrateCartItem);
          const hadChanges = migratedItems.some((item, i) => item.line_total_cents !== state.items[i].line_total_cents);
          if (hadChanges) {
            console.log('✅ Cart migration complete, updating storage');
            state.items = migratedItems;
          } else {
            console.log('✅ No migration needed');
          }
        }
      },
    }
  )
);
