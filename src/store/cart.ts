import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets, TextElement } from './quote';
import { calculateTax, calculateTotalWithTax, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { cartSync } from '@/lib/cartSync';
import { trackAddToCart, trackFBAddToCart } from '@/lib/analytics';

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
  thumbnail_url?: string;          // Rendered thumbnail with grommets for cart display
  web_preview_url?: string;            // Permanent Cloudinary URL for web preview (AI images)
  print_ready_url?: string;            // Permanent Cloudinary URL for print-ready file (AI images)
  is_pdf?: boolean;                    // Whether the file is a PDF
  text_elements?: TextElement[];      // Text layers added in design tool
  overlay_image?: {                   // Logo/graphic overlay (legacy - single image)
    name: string;
    url: string;
    fileKey: string;
    position: { x: number; y: number };
    scale: number;
    aspectRatio?: number;
  };
  overlay_images?: Array<{            // NEW: Multiple overlay images support
    name: string;
    url: string;
    fileKey: string;
    position: { x: number; y: number };
    scale: number;
    aspectRatio?: number;
  }>;
  // AI Design metadata (optional)
  canvas_background_color?: string;    // Canvas background color (hex)
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

export interface DiscountCode {
  id: string;
  code: string;
  discountPercentage: number;
  discountAmountCents: number | null;
  expiresAt: string;
}

export interface CartState {
  syncToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  items: CartItem[];
  isLoading: boolean;  // Loading state for cart operations (merge, load from server)
  isLoading: boolean;  // Loading state for cart operations (merge, load from server)
  discountCode: DiscountCode | null;
  addFromQuote: (quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => void;
  loadItemIntoQuote: (itemId: string) => CartItem | null;
  updateCartItem: (itemId: string, quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  clearCartLocal: () => void;  // Clear cart in memory only, without syncing to server
  applyDiscountCode: (discount: DiscountCode) => void;
  removeDiscountCode: () => void;
  getDiscountAmountCents: () => number;
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
      isLoading: false,
      discountCode: null,
      
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

        // CRITICAL: Always use authoritative pricing when provided
        // Fallback to computed values only if pricing is not provided
        const unit_price_cents = pricing?.unit_price_cents !== undefined ? pricing.unit_price_cents : computedUnit;
        const rope_cost_cents = pricing?.rope_cost_cents !== undefined ? pricing.rope_cost_cents : computedRope;
        const rope_pricing_mode: PricingMode = pricing?.rope_pricing_mode ?? 'per_item';
        const pole_pocket_cost_cents = pricing?.pole_pocket_cost_cents !== undefined ? pricing.pole_pocket_cost_cents : computedPole;
        const pole_pocket_pricing_mode: PricingMode = pricing?.pole_pocket_pricing_mode ?? 'per_item';
        const line_total_cents = pricing?.line_total_cents !== undefined ? pricing.line_total_cents : computedLine;
        
        console.log('🔍 [ADD TO CART] Computed fallback values:', {
          computedUnit,
          computedRope,
          computedPole,
          computedLine
        });
        
        console.log('🔍 [UPDATE CART] Final pricing values:', {
          unit_price_cents,
          rope_cost_cents,
          pole_pocket_cost_cents,
          line_total_cents,
          ropeFeet,
          usingAuthoritative,
          pricingProvided: !!pricing
        });
        
        console.log('🔍 [UPDATE CART] Pricing object received:', pricing);
        console.log('🔍 [UPDATE CART] Computed fallback pole pocket cost:', computedPole);
        console.log('🔍 [UPDATE CART] Final pole_pocket_cost_cents to be saved:', pole_pocket_cost_cents);
        console.log('🔍 [UPDATE CART] Quote polePockets value:', quote.polePockets);

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
          // CRITICAL: Never save blob URLs - they don't persist across sessions
          // Use thumbnailUrl if provided (may be blob URL for immediate display)
          // Note: Blob URLs won't persist across sessions, but will work for current session
          file_url: (() => {
            // PRIORITY: Use explicit fileUrl from PricingCard if provided (already validated)
            const explicitFileUrl = (quote as any).fileUrl;
            if (explicitFileUrl) {
              console.log('[CART STORE] ✅ Using explicit fileUrl from PricingCard:', explicitFileUrl.substring(0, 80));
              return explicitFileUrl;
            }
            // Fallback: Check file and overlayImage
            const fileUrl = (quote.file as any)?.originalUrl || quote.file?.url || (quote as any).overlayImage?.url;
            const fileKey = quote.file?.fileKey || (quote as any).overlayImage?.fileKey;
            const proofUrl = aiMetadata?.assets?.proofUrl;
            
            console.log('[CART STORE] 🔍 File data:', {
              fileUrl: fileUrl ? fileUrl.substring(0, 80) : 'NULL',
              originalUrl: (quote.file as any)?.originalUrl ? (quote.file as any).originalUrl.substring(0, 80) : 'NULL',
              blobUrl: quote.file?.url?.startsWith('blob:') ? 'YES' : 'NO',
              fileKey: fileKey || 'NULL',
              proofUrl: proofUrl ? proofUrl.substring(0, 80) : 'NULL',
              hasFile: !!quote.file,
              hasOverlayImage: !!(quote as any).overlayImage,
              isPdf: quote.file?.isPdf || false
            });
            
            // Skip blob/data URLs - they're temporary
            const finalUrl = (fileUrl && !fileUrl.startsWith('blob:') && !fileUrl.startsWith('data:')) 
              ? fileUrl 
              : (proofUrl && !proofUrl.startsWith('blob:') && !proofUrl.startsWith('data:')) 
                ? proofUrl 
                : null;
            
            console.log('[CART STORE] ��️ Original file_url:', finalUrl ? finalUrl.substring(0, 80) + '...' : 'NULL');
            return finalUrl;
          })(),
          thumbnail_url: (() => {
            // Store thumbnail for DISPLAY in cart (has grommets/text rendered)
            const thumbnailUrl = (quote as any).thumbnailUrl;
            console.log('[CART STORE] 🖼️ Thumbnail URL for display:', thumbnailUrl ? thumbnailUrl.substring(0, 80) + '...' : 'NULL');
            return thumbnailUrl || null;
          })(),
          web_preview_url: (aiMetadata?.assets?.proofUrl?.startsWith('blob:') ? null : aiMetadata?.assets?.proofUrl) || null,
          print_ready_url: (aiMetadata?.assets?.finalUrl?.startsWith('blob:') ? null : aiMetadata?.assets?.finalUrl) || null,
          is_pdf: quote.file?.isPdf || false,
          text_elements: quote.textElements && quote.textElements.length > 0 ? quote.textElements : undefined,
          overlay_image: quote.overlayImage ? {
            ...quote.overlayImage,
            position: quote.overlayImage.position || { x: 50, y: 50 }
          } : undefined,
          overlay_images: (quote as any).overlayImages ? (quote as any).overlayImages : undefined, // NEW: Save multiple images
          canvas_background_color: (quote as any).canvasBackgroundColor || '#FFFFFF',
          image_scale: quote.imageScale || 1,
          image_position: quote.imagePosition || { x: 0, y: 0 },
          artwork_width: quote.file?.artworkWidth,
          artwork_height: quote.file?.artworkHeight,
          created_at: new Date().toISOString(),
          ...(aiMetadata || {}),
        };

        console.log('🧮 CART: addFromQuote', { usingAuthoritative, pricing, computed: { unit: computedUnit, rope: computedRope, pole: computedPole, line: computedLine }, stored: newItem });
        console.log('💾 CART STORAGE: Item added, will persist to localStorage');
        console.log("[CART STORE] About to add item to cart:", newItem);
        console.log("[CART STORE] Current cart items:", get().items);
        set((state) => ({ items: [...state.items, newItem] }));

        console.log("[CART STORE] Item added successfully. New cart items:", get().items);
        // CRITICAL FIX: Set cart owner to current user
        const userId = cartSync.getUserId();
        if (userId && typeof localStorage !== 'undefined') {
          localStorage.setItem('cart_owner_user_id', userId);
          console.log('✅ CART: Set cart owner to:', userId);
        }

        // Track add to cart event
        trackAddToCart({
          id: newItem.id,
          name: `${quote.widthIn}x${quote.heightIn} ${quote.material} Banner`,
          material: quote.material,
          size: `${quote.widthIn}x${quote.heightIn}`,
          price: newItem.line_total_cents,
          quantity: newItem.quantity,
        });
        
        // Track Facebook Pixel AddToCart
        trackFBAddToCart({
          content_name: `${quote.widthIn}x${quote.heightIn} ${quote.material} Banner`,
          value: newItem.line_total_cents,
        });
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        console.log("[CART STORE] Syncing to server. Items count:", itemsToSync.length);
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
          console.log(`[CART STORE] Item ${idx} thumbnail_url:`, item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL');
        });
        get().syncToServer();
      }, 0);
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
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        console.log("[CART STORE] Syncing to server. Items count:", itemsToSync.length);
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
          console.log(`[CART STORE] Item ${idx} thumbnail_url:`, item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL');
        });
        get().syncToServer();
      }, 0);
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
        console.log('🔍 [UPDATE CART] Quote state:', {
          addRope: quote.addRope,
          polePockets: quote.polePockets,
          polePocketSize: quote.polePocketSize,
          widthIn: quote.widthIn,
          heightIn: quote.heightIn,
          quantity: quote.quantity
        });
        console.log('🔍 [UPDATE CART] Authoritative pricing:', pricing);
        
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

        // CRITICAL: Always use authoritative pricing when provided
        // Fallback to computed values only if pricing is not provided
        const unit_price_cents = pricing?.unit_price_cents !== undefined ? pricing.unit_price_cents : computedUnit;
        const rope_cost_cents = pricing?.rope_cost_cents !== undefined ? pricing.rope_cost_cents : computedRope;
        const rope_pricing_mode: PricingMode = pricing?.rope_pricing_mode ?? 'per_item';
        const pole_pocket_cost_cents = pricing?.pole_pocket_cost_cents !== undefined ? pricing.pole_pocket_cost_cents : computedPole;
        const pole_pocket_pricing_mode: PricingMode = pricing?.pole_pocket_pricing_mode ?? 'per_item';
        const line_total_cents = pricing?.line_total_cents !== undefined ? pricing.line_total_cents : computedLine;
        
        console.log('🔍 [ADD TO CART] Computed fallback values:', {
          computedUnit,
          computedRope,
          computedPole,
          computedLine
        });
        
        console.log('🔍 [UPDATE CART] Final pricing values:', {
          unit_price_cents,
          rope_cost_cents,
          pole_pocket_cost_cents,
          line_total_cents,
          ropeFeet,
          usingAuthoritative,
          pricingProvided: !!pricing
        });
        
        console.log('🔍 [UPDATE CART] Pricing object received:', pricing);
        console.log('🔍 [UPDATE CART] Computed fallback pole pocket cost:', computedPole);
        console.log('🔍 [UPDATE CART] Final pole_pocket_cost_cents to be saved:', pole_pocket_cost_cents);
        console.log('🔍 [UPDATE CART] Quote polePockets value:', quote.polePockets);

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
          // CRITICAL: Never save blob URLs - they don't persist across sessions
          // Use thumbnailUrl if provided, otherwise fall back to file.url or existing
          // CRITICAL: For PDFs, use originalUrl (Cloudinary URL before blob conversion)
          file_url: (quote as any).thumbnailUrl || ((quote.file as any)?.originalUrl || ((quote.file?.url?.startsWith('blob:')) ? null : quote.file?.url)) || aiMetadata?.assets?.proofUrl || existingItem.file_url,
          thumbnail_url: (quote as any).thumbnailUrl || existingItem.thumbnail_url, // CRITICAL: Update thumbnail for cart display
          web_preview_url: aiMetadata?.assets?.proofUrl || existingItem.web_preview_url,
          print_ready_url: aiMetadata?.assets?.finalUrl || existingItem.print_ready_url,
          is_pdf: quote.file?.isPdf || false,
          text_elements: quote.textElements && quote.textElements.length > 0 ? quote.textElements : undefined,
          overlay_image: quote.overlayImage ? {
            ...quote.overlayImage,
            position: quote.overlayImage.position || { x: 50, y: 50 }
          } : undefined,
          overlay_images: (quote as any).overlayImages ? (quote as any).overlayImages : undefined, // NEW: Save multiple images
          canvas_background_color: (quote as any).canvasBackgroundColor || '#FFFFFF',
          image_scale: quote.imageScale || 1,
          image_position: quote.imagePosition || { x: 0, y: 0 },
          ...(aiMetadata || {}),
        };

        console.log('✅ CART: updateCartItem success', { updatedItem });
        
        // CRITICAL FIX: Set cart owner to current user
        const userId = cartSync.getUserId();
        if (userId && typeof localStorage !== 'undefined') {
          localStorage.setItem('cart_owner_user_id', userId);
          console.log('✅ CART: Set cart owner to:', userId);
        }
        
        set((state) => ({
          items: state.items.map(item => item.id === itemId ? updatedItem : item)
        }));
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        console.log("[CART STORE] Syncing to server. Items count:", itemsToSync.length);
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
          console.log(`[CART STORE] Item ${idx} thumbnail_url:`, item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL');
        });
        get().syncToServer();
      }, 0);
      },
      removeItem: (id: string) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== id)
        }));
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        console.log("[CART STORE] Syncing to server. Items count:", itemsToSync.length);
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
          console.log(`[CART STORE] Item ${idx} thumbnail_url:`, item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL');
        });
        get().syncToServer();
      }, 0);
      },
      
      clearCart: () => {
        set({ items: [], discountCode: null });
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        console.log("[CART STORE] Syncing to server. Items count:", itemsToSync.length);
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
          console.log(`[CART STORE] Item ${idx} thumbnail_url:`, item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL');
        });
        get().syncToServer();
      }, 0);
      },

      clearCartLocal: () => {
        console.log("🧹 clearCartLocal: Clearing cart in memory ONLY (no server sync)");
        set({ items: [], discountCode: null });
        console.log("✅ clearCartLocal: Cart cleared locally");
      },

      applyDiscountCode: (discount: DiscountCode) => {
        set({ discountCode: discount });
      },

      removeDiscountCode: () => {
        set({ discountCode: null });
      },

      getDiscountAmountCents: () => {
        const discount = get().discountCode;
        if (!discount) return 0;

        const subtotal = get().getSubtotalCents();
        
        // Use percentage discount if available
        if (discount.discountPercentage) {
          return Math.round(subtotal * (discount.discountPercentage / 100));
        }
        
        // Otherwise use fixed amount discount
        if (discount.discountAmountCents) {
          return Math.min(discount.discountAmountCents, subtotal);
        }
        
        return 0;
      },

      

      // Sync cart to Neon database (for logged-in users)
      syncToServer: async () => {
        const userId = cartSync.getUserId();
        const rawItems = get().items;
        
        // Helper to check if a string is a bad URL (blob, data, or too large)
        const isBadUrl = (url: string | undefined | null): boolean => {
          if (!url || typeof url !== 'string') return false;
          return url.startsWith('blob:') || url.startsWith('data:') || url.length > 10000;
        };
        
        // CRITICAL: Strip out blob/data URLs before syncing - they're too large for the database
        const items = rawItems.map(item => {
          const cleaned = { ...item };
          // DEBUG: Log thumbnail_url before cleaning
          console.log('[syncToServer] Item thumbnail_url BEFORE cleaning:', {
            id: item.id,
            thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 100) : 'NULL',
            isBlob: item.thumbnail_url?.startsWith('blob:'),
            isData: item.thumbnail_url?.startsWith('data:'),
            length: item.thumbnail_url?.length
          });
          // Remove bad URLs from all URL fields
          if (isBadUrl(cleaned.thumbnail_url)) {
            console.log('[syncToServer] ⚠️ STRIPPING bad thumbnail_url:', item.thumbnail_url?.substring(0, 50));
            cleaned.thumbnail_url = undefined;
          }
          if (isBadUrl(cleaned.file_url)) {
            console.log('[syncToServer] Stripping bad file_url');
            cleaned.file_url = undefined;
          }
          if (isBadUrl(cleaned.web_preview_url)) {
            console.log('[syncToServer] Stripping bad web_preview_url');
            cleaned.web_preview_url = undefined;
          }
          if (isBadUrl(cleaned.print_ready_url)) {
            console.log('[syncToServer] Stripping bad print_ready_url');
            cleaned.print_ready_url = undefined;
          }
          // Clean overlay_image
          if (cleaned.overlay_image?.url && isBadUrl(cleaned.overlay_image.url)) {
            console.log('[syncToServer] Stripping bad overlay_image.url');
            cleaned.overlay_image = { ...cleaned.overlay_image, url: undefined };
          }
          // Clean overlay_images array
          if (Array.isArray(cleaned.overlay_images)) {
            cleaned.overlay_images = cleaned.overlay_images.map(img => {
              if (img?.url && isBadUrl(img.url)) {
                console.log('[syncToServer] Stripping bad overlay_images[].url');
                return { ...img, url: undefined };
              }
              return img;
            });
          }
          return cleaned;
        });
        
        // CRITICAL FIX: Save guest carts to database using session ID
        // This ensures guest carts can be merged when user signs in
        if (!userId) {
          const sessionId = cartSync.getSessionId();
          console.log('👤 No user logged in - saving guest cart with session ID:', sessionId ? `${sessionId.substring(0, 12)}...` : 'none');
          
          if (sessionId && items.length > 0) {
            const success = await cartSync.saveCart(items, undefined, sessionId);
            if (success) {
              console.log('✅ STORE: Guest cart synced to server successfully');
            } else {
              console.error('❌ STORE: Failed to sync guest cart to server');
            }
          }
          return;
        }
        
        console.log('💾 STORE: Syncing cart to server...', { userId, itemCount: items.length });
        const success = await cartSync.saveCart(items, userId);
        if (success) {
          console.log('✅ STORE: Cart synced to server successfully');
        } else {
          console.error('❌ STORE: Failed to sync cart to server - cart will remain in localStorage');
        }
      },

      // Load cart from Neon database and merge with local
      // Load cart from Neon database and merge with local
      loadFromServer: async () => {
        console.log('🔵 STORE: loadFromServer called');
        console.log('🔵 STORE: loadFromServer STACK TRACE:', new Error().stack);
        console.log('🔵 STORE: loadFromServer STACK TRACE:', new Error().stack);
        const userId = cartSync.getUserId();
        console.log('🔵 STORE: Got user ID:', userId);
        
        if (!userId) {
          console.log('❌ STORE: No user logged in, skipping server load');
          return;
        }

        console.log('🔵 STORE: Loading cart from server...');
        const serverItems = await cartSync.loadCart(userId);
        const localItems = get().items;
        const cartOwnerId = typeof localStorage !== 'undefined' ? localStorage.getItem('cart_owner_user_id') : null;
        
        console.log('🔵 STORE: Server items count:', serverItems.length);
        console.log('🔵 STORE: Local items count:', localItems.length);
        console.log('🔵 STORE: Cart owner ID:', cartOwnerId);
        console.log('🔵 STORE: Current user ID:', userId);
        
        // SIMPLIFIED LOGIC: Always use server cart when available
        // If server has items, use them (they are the source of truth)
        if (serverItems.length > 0) {
          console.log("🖼️  STORE: Checking image URLs in server items:");
          serverItems.forEach((item, idx) => {
            console.log(`  Item ${idx}:`, {
              id: item.id,
              thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL',
              web_preview_url: item.web_preview_url,
              file_url: item.file_url,
              print_ready_url: item.print_ready_url,
              aiDesign_proofUrl: item.aiDesign?.assets?.proofUrl
            });
          });
          console.log('✅ STORE: Server has items, using server cart');
          set({ items: serverItems });
          
          // Set cart owner
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('cart_owner_user_id', userId);
          }
          return;
        }
        
        // Server cart is empty
        // Server cart is empty
        if (localItems.length > 0) {
          // Check if local cart belongs to this user OR is a guest cart (null owner)
          if (cartOwnerId === userId || cartOwnerId === null) {
            console.log('⚠️ STORE: Server cart empty but local cart belongs to this user or is guest cart');
            console.log('⚠️ STORE: Saving local cart to server');
            // Set cart owner to current user
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('cart_owner_user_id', userId);
            }
            // Save local cart to server
            setTimeout(() => get().syncToServer(), 100);
            return;
          } else {
            console.log('⚠️ STORE: Server cart empty and local cart belongs to different user');
            console.log('⚠️ STORE: Cart owner:', cartOwnerId, 'Current user:', userId);
            console.log('⚠️ STORE: Clearing local cart');
            set({ items: [] });
            return;
          }
        }
        // Both server and local are empty
        console.log('ℹ️  STORE: Both server and local carts are empty');
        set({ items: [] });
      },

      getMigratedItems: () => {
        return get().items.map(migrateCartItem);
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

        let total;
        if (flags.freeShipping || flags.minOrderFloor) {
          const pricingOptions = getPricingOptions();
          const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
          const totals = computeTotals(pricingItems, 0.06, pricingOptions);
          total = totals.total_cents;
        } else {
          const subtotal = get().getSubtotalCents();
          total = Math.round(calculateTotalWithTax(subtotal / 100) * 100);
        }

        // Subtract discount from total
        const discountAmount = get().getDiscountAmountCents();
        return Math.max(0, total - discountAmount);
      },


      getItemCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      }
    }),
    {
      name: 'cart-storage',
      // CRITICAL: Do NOT persist items array to localStorage
      // Items should ONLY come from the server (database)
      // This prevents showing wrong user's cart after login
      partialize: (state) => ({
        discountCode: state.discountCode,
        // items are intentionally excluded - they come from server only
      }),
      // Items are NOT persisted to localStorage (only discountCode is)
      // Items come from server only via useCartSync
      onRehydrateStorage: () => (state) => {
        console.log('💾 CART STORAGE: Rehydrating from localStorage...');
        console.log('💾 CART STORAGE: Only discountCode is persisted, items come from server');
        console.log('�� CART STORAGE: useCartSync will load items from database');
      },
    }
  )
);
