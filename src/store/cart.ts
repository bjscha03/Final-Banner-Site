import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets, TextElement } from './quote';
import { calculateTax, calculateTotalWithTax, getFeatureFlags, getPricingOptions, computeTotals, PricingItem, MINIMUM_UNIT_PRICE_CENTS } from '@/lib/pricing';
import { calculateQuantityDiscount } from '@/lib/quantity-discount';
import {
  getPromoDiscountSubtotalCents,
  getAutomaticLargeBannerSubtotalCents,
  resolveBestDiscount,
  type DiscountScope,
  type ResolvedDiscount,
  type PromoDiscountInput,
} from '@/lib/discount-resolver';
import { cartSync } from '@/lib/cartSync';
import { trackAddToCart, trackFBAddToCart } from '@/lib/analytics';
import { getProductConfig } from '@/lib/products';
import type { ProductTypeSlug } from '@/lib/products';
import type { ArtworkManifest, PlacementPreviewManifest } from '@/types/artwork';
import { createStableCartItemId } from '@/lib/cartItemIdentity';
import { isReadyPlacementPreview, PreviewLifecycleError } from '@/lib/previewLifecycle';
import { calculateBannerPricing, type RopePlacement } from '@/lib/bannerPricingEngine';
import {
  computeSameDayFeesCents,
  evaluateSameDayEligibility,
  getEligibleSubtotalCents,
} from '@/lib/sameDayService';
import { writeStoredAbandonedCartRecoveryAttribution } from '@/lib/abandonedCartCapture';
import {
  canCommitAccountCartHydration,
  canStartAccountCartHydration,
  captureAccountCartHydrationTicket,
} from '@/lib/cartRecoveryStartup';


// PERFORMANCE: Disable verbose logging in production for faster cart operations
const CART_DEBUG = false;
const debugLog = CART_DEBUG ? console.log.bind(console) : () => {};

// These identifiers belonged to a retired seasonal campaign. Keep the guard
// solely to purge stale carts created before the campaign was removed; no UI
// or checkout path can create them anymore.
const RETIRED_CAMPAIGN_PRODUCT_TYPES = new Set(['design_deposit', 'graduation_final_payment']);
const isRetiredCampaignItem = (item: Pick<CartItem, 'product_type'>): boolean => (
  RETIRED_CAMPAIGN_PRODUCT_TYPES.has(item.product_type || '')
);

export type PricingMode = 'per_item' | 'per_order';

export interface CartItem {
  id: string;
  product_type?: string;               // Product type slug (default: 'banner')
  width_in: number;
  height_in: number;
  quantity: number;
  material: MaterialKey;
  grommets: Grommets;
  pole_pockets: string;
  pole_pocket_size?: string;          // pole pocket size (e.g., "2", "3", "4")
  pole_pocket_position?: string;      // pole pocket position (e.g., "top", "bottom", "top-bottom")
  rounded_corners?: string | null;    // Car magnet rounded corner selection
  rope_feet: number;
  rope_placement?: string | null;     // Rope placement: 'top' | 'bottom' | 'top-bottom'
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
  canva_design_id?: string;           // Canva design ID for re-editing
  canvas_background_color?: string;    // Canvas background color (hex)
  image_scale?: number;                // Background image scale (for uploaded images)
  image_scale_y?: number;              // PR3: Per-axis Y scale for freeform resize. Defaults to image_scale (uniform).
  image_position?: { x: number; y: number }; // Background image position (for uploaded images)
  fit_mode?: 'fill' | 'fit' | 'stretch';     // Image fit mode (for uploaded images)
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

  // Source tracking: which page/flow created this cart item
  source?: 'google-ads' | 'design' | 'homepage';

  // Final render snapshot for pixel-perfect admin PDF generation
  // These fields capture exactly what the user saw at checkout time
  final_render_url?: string;           // Cloudinary URL of high-res canvas snapshot
  final_render_file_key?: string;      // Cloudinary file key for direct access
  final_render_width_px?: number;      // Width in pixels
  final_render_height_px?: number;     // Height in pixels
  final_render_dpi?: number;           // DPI used for capture (typically 300, may be clamped for large banners)
  canvas_state_json?: string;          // Exact stage/canvas JSON at submission for re-rendering
  artwork_manifest?: ArtworkManifest;
  placement_preview?: PlacementPreviewManifest;
  composition_signature?: string;
  composition_revision?: number;

  // Yard Sign metadata (only for product_type === 'yard_sign')
  yard_sign_sidedness?: 'single' | 'double';     // Print sidedness
  yard_sign_step_stakes_enabled?: boolean;        // Step stakes add-on
  yard_sign_step_stakes_qty?: number;             // Number of step stakes
  yard_sign_design_count?: number;                // Number of uploaded designs
  yard_sign_designs?: Array<{                     // Per-design details
    id: string;
    fileName: string;
    fileUrl: string;
    fileKey: string;
    thumbnailUrl: string;
    isPdf: boolean;
    quantity: number;
    imgScale?: number;                             // Preview state: zoom level
    imgScaleY?: number;
    imgPos?: { x: number; y: number };             // Preview state: position offset
    imgConstrain?: boolean;
    previewThumbnailUrl?: string;                   // Rendered preview thumbnail (single source of truth)
    placementPreview?: PlacementPreviewManifest;
    compositionSignature?: string;
  }>;
  yard_sign_signs_subtotal_cents?: number;        // Sign subtotal before stakes
  yard_sign_stakes_subtotal_cents?: number;       // Stakes subtotal

  // Design Service fields - "Let Our Team Design It" flow
  design_service_enabled?: boolean;              // True if customer chose design service
  design_request_text?: string;                  // Customer's description of what they want
  design_draft_preference?: 'email' | 'text';    // How customer wants draft delivered
  design_draft_contact?: string;                 // Email or phone for draft delivery
  design_uploaded_assets?: Array<{               // Files customer uploaded for design reference
    name: string;
    type: string;
    size: number;
    url: string;
    fileKey?: string;
  }>;
  final_print_pdf_url?: string;                  // Admin-uploaded final print PDF
  final_print_pdf_file_key?: string;             // Cloudinary file key for final PDF
  final_print_pdf_uploaded_at?: string;          // ISO timestamp of when admin uploaded PDF

  // Same-Day Hit Service (captured at add-to-cart time for display and order tracking)
  sameDayHitServiceSelected?: boolean;           // Whether Same-Day Hit Service was selected for this item
  sameDayHitServicePrice?: number;               // Same-Day Hit Service fee in cents for this item at add-to-cart time
}

export interface AuthoritativePricing {
  unit_price_cents: number;
  rope_cost_cents: number;
  rope_pricing_mode?: PricingMode;
  pole_pocket_cost_cents: number;
  pole_pocket_pricing_mode?: PricingMode;
  line_total_cents: number;
}

export interface CanonicalCartQuoteLine {
  index: number;
  cartItemId: string;
  productType: string;
  unitPriceCents: number;
  lineTotalCents: number;
  ropeFeet: number;
  ropeCostCents: number;
  polePocketCostCents: number;
  yardSignSignsSubtotalCents?: number;
  yardSignStakesSubtotalCents?: number;
}

export interface CanonicalCartQuote {
  items: CanonicalCartQuoteLine[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  appliedDiscountCents: number;
  appliedDiscountLabel?: string | null;
  appliedDiscountType?: string | null;
  discountCode?: string | null;
  sameDayFeeCents?: number;
  saturdayFeeCents?: number;
}

export interface DiscountCode {
  id: string;
  code: string;
  discountPercentage: number;
  discountAmountCents: number | null;
  expiresAt: string;
  source?: 'new_customer' | 'trade_show' | 'discount_codes' | 'seasonal_promotion';
  tradeShowSlug?: string;
  recoveryOffer?: boolean;
  recoveryCartId?: string | null;
  campaign?: string | null;
  discountScope?: DiscountScope;
  eligibleCartItemIds?: string[];
  maxDiscountAmountCents?: number | null;
  activatedAt?: string | null;
}

export interface CartState {
  syncToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  replaceItemsFromRecovery: (items: CartItem[]) => Promise<void>;
  items: CartItem[];
  isLoading: boolean;  // Loading state for cart operations (merge, load from server)
  isSyncing: boolean;  // Flag to prevent loadFromServer from overwriting during sync
  discountCode: DiscountCode | null;
  // Same-Day Hit Service upsell flags (production priority — NOT shipping)
  sameDayHitService: boolean;
  saturdayDelivery: boolean;
  setSameDayHitService: (on: boolean) => void;
  setSaturdayDelivery: (on: boolean) => void;
  restoreRecoveredCheckoutPreferences: (preferences: {
    sameDayHitService: boolean;
    saturdayDelivery: boolean;
  }) => { sameDayHitService: boolean; saturdayDelivery: boolean };
  /**
   * Re-evaluate Same-Day window/eligibility against the current ET clock and
   * cart contents. Clears `sameDayHitService` (and `saturdayDelivery`) if the
   * cutoff has passed or no items remain eligible. Returns true if anything
   * was cleared so the caller can surface a toast.
   */
  reconcileSameDayHitService: () => { cleared: boolean; reason: string | null };
  getSameDayFeeCents: () => number;
  getSaturdayDeliveryFeeCents: () => number;
  addFromQuote: (quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => string;
  loadItemIntoQuote: (itemId: string) => CartItem | null;
  updateCartItem: (itemId: string, quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => void;
  applyCanonicalPricingQuote: (quote: CanonicalCartQuote) => boolean;
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
  // Quantity discount - "Buy More, Save More"
  getQuantityDiscountInfo: () => {
    totalQuantity: number;
    discountRate: number;
    discountCents: number;
  };
  // Best Discount Resolver - "Best Discount Wins" (no stacking)
  getResolvedDiscount: () => ResolvedDiscount;
}


// Migration function to fix old cart items with missing or zero pricing fields
const migrateCartItem = (item: CartItem): CartItem => {
  const storedRopePlacement: RopePlacement | null = item.rope_placement === 'bottom'
    || item.rope_placement === 'top-bottom'
    || item.rope_placement === 'top'
    ? item.rope_placement
    : ((item.rope_feet || 0) > 0 ? 'top' : null);
  // Check if this is an old item that needs migration
  const needsMigration = 
    item.line_total_cents === 0 || 
    item.line_total_cents === undefined || 
    item.unit_price_cents === 0 || 
    item.unit_price_cents === undefined;

  if (!needsMigration) {
    return item.rope_placement === storedRopePlacement
      ? item
      : { ...item, rope_placement: storedRopePlacement };
  }

  if ((item.product_type || 'banner') !== 'banner') {
    return item;
  }

  const bannerPricing = calculateBannerPricing({
    widthIn: item.width_in,
    heightIn: item.height_in,
    quantity: item.quantity,
    material: item.material,
    grommets: item.grommets,
    // Backward compatibility: older records may use pole_pocket_position.
    polePockets: item.pole_pockets || item.pole_pocket_position || 'none',
    addRope: (item.rope_feet || 0) > 0,
    ropePlacement: storedRopePlacement || 'top',
  });

  const unit_price_cents = bannerPricing.unitBasePriceCents;
  const rope_cost_cents = bannerPricing.ropeCostCents;
  const pole_pocket_cost_cents = bannerPricing.polePocketCostCents;
  const line_total_cents = bannerPricing.subtotalBeforeDiscountCents;

  const migratedItem = {
    ...item,
    rope_feet: bannerPricing.ropeLinearFeet,
    rope_placement: storedRopePlacement,
    unit_price_cents,
    rope_cost_cents,
    rope_pricing_mode: (item.rope_pricing_mode || 'per_item') as PricingMode,
    pole_pocket_cost_cents,
    pole_pocket_pricing_mode: (item.pole_pocket_pricing_mode || 'per_item') as PricingMode,
    line_total_cents,
  };

  return migratedItem;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      isSyncing: false,
      discountCode: null,
      sameDayHitService: false,
      saturdayDelivery: false,

      setSameDayHitService: (on: boolean) => {
        if (on) {
          // Server is authoritative, but we mirror server logic on the client
          // to keep UX consistent. We only gate on the ET window here — not
          // on cart eligibility — so the option can be selected from a product
          // page before the item is in the cart. The reconciler runs whenever
          // items change and will clear the flag if the cart ends up
          // ineligible at checkout time.
          const items = get().items.map(migrateCartItem);
          const evalResult = evaluateSameDayEligibility({ items });
          if (!evalResult.windowOpen) {
            return;
          }
          set({ sameDayHitService: true });
        } else {
          // Turning off Same-Day automatically clears Saturday Delivery.
          set({ sameDayHitService: false, saturdayDelivery: false });
        }
      },

      setSaturdayDelivery: (on: boolean) => {
        if (!on) {
          set({ saturdayDelivery: false });
          return;
        }
        // Guard: only allowed when same-day is on AND today qualifies (Friday)
        if (!get().sameDayHitService) return;
        const items = get().items.map(migrateCartItem);
        const evalResult = evaluateSameDayEligibility({ items });
        if (!evalResult.saturdayEligible) return;
        set({ saturdayDelivery: true });
      },

      restoreRecoveredCheckoutPreferences: (preferences) => {
        const items = get().items.map(migrateCartItem);
        const eligibility = evaluateSameDayEligibility({ items });
        const sameDayHitService = preferences.sameDayHitService === true
          && eligibility.windowOpen
          && eligibility.hasEligibleItem;
        const saturdayDelivery = sameDayHitService
          && preferences.saturdayDelivery === true
          && eligibility.saturdayEligible;
        set({ sameDayHitService, saturdayDelivery });
        return { sameDayHitService, saturdayDelivery };
      },

      reconcileSameDayHitService: () => {
        const state = get();
        if (!state.sameDayHitService && !state.saturdayDelivery) {
          return { cleared: false, reason: null };
        }
        const items = state.items.map(migrateCartItem);
        const evalResult = evaluateSameDayEligibility({ items });
        // If window closed or eligibility lost, clear both flags.
        if (!evalResult.windowOpen || !evalResult.hasEligibleItem) {
          set({ sameDayHitService: false, saturdayDelivery: false });
          return { cleared: true, reason: evalResult.reason };
        }
        // Saturday no longer eligible (e.g. day rolled over) — clear it
        // but keep same-day on.
        if (state.saturdayDelivery && !evalResult.saturdayEligible) {
          set({ saturdayDelivery: false });
          return { cleared: true, reason: 'saturday_no_longer_eligible' };
        }
        return { cleared: false, reason: null };
      },

      getSameDayFeeCents: () => {
        const state = get();
        if (!state.sameDayHitService) return 0;
        const items = state.items.map(migrateCartItem);
        const eligibleSubtotal = getEligibleSubtotalCents(items);
        const fees = computeSameDayFeesCents(eligibleSubtotal, {
          sameDay: true,
          saturday: state.saturdayDelivery,
        });
        return fees.sameDayFeeCents;
      },

      getSaturdayDeliveryFeeCents: () => {
        const state = get();
        if (!state.sameDayHitService || !state.saturdayDelivery) return 0;
        const items = state.items.map(migrateCartItem);
        const eligibleSubtotal = getEligibleSubtotalCents(items);
        const fees = computeSameDayFeesCents(eligibleSubtotal, {
          sameDay: true,
          saturday: true,
        });
        return fees.saturdayFeeCents;
      },
      
      addFromQuote: (quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing): string => {
        debugLog('🚨 addFromQuote CALLED - Current items in cart:', get().items.length);
        debugLog('🚨 addFromQuote CALLED - Current items in cart:', get().items.length);
        const requestedPlacement = (quote as any).placementPreview as PlacementPreviewManifest | undefined;
        const requestedProductType = (quote as any).product_type || 'banner';
        if (requestedPlacement && !isReadyPlacementPreview(requestedPlacement)) {
          throw new PreviewLifecycleError(
            'PERMANENT_PREVIEW_UNAVAILABLE',
            'Refusing to create a cart line with a non-ready exact preview.',
          );
        }
        if (requestedPlacement && (
          requestedPlacement.productType !== requestedProductType
          || requestedPlacement.widthIn !== quote.widthIn
          || requestedPlacement.heightIn !== quote.heightIn
        )) {
          throw new PreviewLifecycleError(
            'COMPOSITION_CHANGED',
            'The exact preview identity does not match the cart line being created.',
            {
              requestedProductType,
              requestedWidthIn: quote.widthIn,
              requestedHeightIn: quote.heightIn,
              previewProductType: requestedPlacement.productType,
              previewWidthIn: requestedPlacement.widthIn,
              previewHeightIn: requestedPlacement.heightIn,
            },
          );
        }
        const exactPreviewUrl = requestedPlacement?.previewUrl;
        // Capture design-page authoritative pricing when provided
        const usingAuthoritative = !!pricing;

        // Compute fallbacks if not provided
        const area = (quote.widthIn * quote.heightIn) / 144;
        const activeProductType = ((quote as { product_type?: ProductTypeSlug }).product_type || 'banner');
        const productConfig = getProductConfig(activeProductType);
        const fallbackBannerPricing = activeProductType === 'banner'
          ? calculateBannerPricing({
              widthIn: quote.widthIn,
              heightIn: quote.heightIn,
              quantity: quote.quantity,
              material: quote.material,
              grommets: quote.grommets,
              polePockets: quote.polePockets,
              addRope: quote.addRope,
              ropePlacement: quote.ropePlacement || 'top',
            })
          : null;
        const pricePerSqFt = (productConfig.materialPriceMap as Record<MaterialKey, number>)[quote.material];
        const computedUnit = fallbackBannerPricing
          ? fallbackBannerPricing.unitBasePriceCents
          : Math.max(MINIMUM_UNIT_PRICE_CENTS, Math.round(area * (pricePerSqFt ?? 4.5) * 100));
        const ropeFeet = fallbackBannerPricing ? fallbackBannerPricing.ropeLinearFeet : (quote.addRope ? quote.widthIn / 12 : 0);
        const computedRope = fallbackBannerPricing
          ? fallbackBannerPricing.ropeCostCents
          : Math.round(ropeFeet * 2 * quote.quantity * 100);
        const computedPole = fallbackBannerPricing
          ? fallbackBannerPricing.polePocketCostCents
          : 0;
        const computedLine = fallbackBannerPricing
          ? fallbackBannerPricing.subtotalBeforeDiscountCents
          : computedUnit * quote.quantity + computedRope + computedPole;

        // CRITICAL: Always use authoritative pricing when provided
        // Fallback to computed values only if pricing is not provided
        const unit_price_cents = pricing?.unit_price_cents !== undefined ? pricing.unit_price_cents : computedUnit;
        const rope_cost_cents = pricing?.rope_cost_cents !== undefined ? pricing.rope_cost_cents : computedRope;
        const rope_pricing_mode: PricingMode = pricing?.rope_pricing_mode ?? 'per_item';
        const pole_pocket_cost_cents = pricing?.pole_pocket_cost_cents !== undefined ? pricing.pole_pocket_cost_cents : computedPole;
        const pole_pocket_pricing_mode: PricingMode = pricing?.pole_pocket_pricing_mode ?? 'per_item';
        const line_total_cents = pricing?.line_total_cents !== undefined ? pricing.line_total_cents : computedLine;
        
        debugLog('🔍 [ADD TO CART] Computed fallback values:', {
          computedUnit,
          computedRope,
          computedPole,
          computedLine
        });
        
        debugLog('🔍 [UPDATE CART] Final pricing values:', {
          unit_price_cents,
          rope_cost_cents,
          pole_pocket_cost_cents,
          line_total_cents,
          ropeFeet,
          usingAuthoritative,
          pricingProvided: !!pricing
        });
        
        debugLog('🔍 [UPDATE CART] Pricing object received:', pricing);
        debugLog('🔍 [UPDATE CART] Computed fallback pole pocket cost:', computedPole);
        debugLog('🔍 [UPDATE CART] Final pole_pocket_cost_cents to be saved:', pole_pocket_cost_cents);
        debugLog('🔍 [UPDATE CART] Quote polePockets value:', quote.polePockets);

        // Use the file key from the uploaded file
        const fileKey = quote.file?.fileKey;
        debugLog('📦 [CART STORE] Extracted fileKey:', fileKey);
        debugLog('📦 [CART STORE] quote.file object:', quote.file);
        debugLog('📦 [CART STORE] This fileKey should be the CANVAS THUMBNAIL key (includes text/images)');
        debugLog('📦 [CART STORE] Extracted fileKey:', fileKey);
        debugLog('📦 [CART STORE] quote.file object:', quote.file);
        debugLog('📦 [CART STORE] This fileKey should be the CANVAS THUMBNAIL key (includes text/images)');

        const newItem: CartItem = {
          id: createStableCartItemId('cart'),
          product_type: requestedProductType,
          width_in: quote.widthIn,
          height_in: quote.heightIn,
          quantity: quote.quantity,
          material: quote.material,
          grommets: quote.grommets,
          pole_pockets: quote.polePockets,
          pole_pocket_size: quote.polePocketSize,
          pole_pocket_position: quote.polePockets,
          rounded_corners: (quote as any).rounded_corners || null,
          rope_feet: ropeFeet,
          rope_placement: quote.addRope ? (quote.ropePlacement || 'top') : null,
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
              debugLog('[CART STORE] ✅ Using explicit fileUrl from PricingCard:', explicitFileUrl.substring(0, 80));
              return explicitFileUrl;
            }
            // Fallback: Check file and overlayImage
            const fileUrl = (quote.file as any)?.productionUrl || (quote.file as any)?.originalUrl || quote.file?.url || (quote as any).overlayImage?.url;
            const fileKey = quote.file?.fileKey || (quote as any).overlayImage?.fileKey;
            const proofUrl = aiMetadata?.assets?.proofUrl;
            
            debugLog('[CART STORE] 🔍 File data:', {
              fileUrl: fileUrl ? fileUrl.substring(0, 80) : 'NULL',
              productionUrl: (quote.file as any)?.productionUrl ? (quote.file as any).productionUrl.substring(0, 80) : 'NULL',
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
            
            debugLog('[CART STORE] ��️ Original file_url:', finalUrl ? finalUrl.substring(0, 80) + '...' : 'NULL');
            return finalUrl;
          })(),
          thumbnail_url: (() => {
            // Store thumbnail for DISPLAY in cart (has grommets/text rendered)
            const thumbnailUrl = exactPreviewUrl || (quote as any).thumbnailUrl || (quote.file as any)?.previewUrl || (quote.file as any)?.thumbnailUrl;
            debugLog('[CART STORE] 🖼️ Thumbnail URL for display:', thumbnailUrl ? thumbnailUrl.substring(0, 80) + '...' : 'NULL');
            debugLog('[CART STORE] 🖼️ Thumbnail URL details:', {
              isBlob: thumbnailUrl?.startsWith('blob:'),
              isData: thumbnailUrl?.startsWith('data:'),
              isCloudinary: thumbnailUrl?.includes('cloudinary.com'),
              length: thumbnailUrl?.length
            });
            return thumbnailUrl || null;
          })(),
          web_preview_url: (() => {
            const explicitWebPreview = exactPreviewUrl || (quote as any).webPreviewUrl;
            if (explicitWebPreview && !explicitWebPreview.startsWith('blob:') && !explicitWebPreview.startsWith('data:')) return explicitWebPreview;
            return (aiMetadata?.assets?.proofUrl?.startsWith('blob:') ? null : aiMetadata?.assets?.proofUrl) || null;
          })(),
          print_ready_url: (aiMetadata?.assets?.finalUrl?.startsWith('blob:') ? null : aiMetadata?.assets?.finalUrl) || null,
          is_pdf: quote.file?.isPdf || false,
          text_elements: quote.textElements && quote.textElements.length > 0 ? quote.textElements : undefined,
          overlay_image: quote.overlayImage ? {
            ...quote.overlayImage,
            position: quote.overlayImage.position || { x: 50, y: 50 }
          } : undefined,
          overlay_images: (quote as any).overlayImages ? (quote as any).overlayImages : undefined, // NEW: Save multiple images
          canva_design_id: (quote as any).canvaDesignId || undefined,
          canvas_background_color: (quote as any).canvasBackgroundColor || '#FFFFFF',
          image_scale: quote.imageScale || 1,
          image_scale_y: (quote as any).imageScaleY ?? quote.imageScale ?? 1,
          image_position: quote.imagePosition || { x: 0, y: 0 },
          fit_mode: quote.fitMode || 'fill',
          artwork_width: quote.file?.artworkWidth,
          artwork_height: quote.file?.artworkHeight,
          created_at: new Date().toISOString(),
          // Auto-detect source based on current page
          source: (typeof window !== 'undefined' && window.location.pathname.includes('google-ads')) ? 'google-ads' : 'design',
          // FINAL_RENDER: High-res snapshot for admin PDF
          final_render_url: (quote as any).finalRenderUrl || undefined,
          final_render_file_key: (quote as any).finalRenderFileKey || undefined,
          final_render_width_px: (quote as any).finalRenderWidthPx || undefined,
          final_render_height_px: (quote as any).finalRenderHeightPx || undefined,
          final_render_dpi: (quote as any).finalRenderDpi || undefined,
          canvas_state_json: (quote as any).canvasStateJson || undefined,
          artwork_manifest: (quote as any).artworkManifest || undefined,
          placement_preview: requestedPlacement,
          composition_signature: requestedPlacement?.compositionSignature,
          composition_revision: requestedPlacement?.compositionRevision,
          // Yard Sign metadata (populated when product_type is 'yard_sign')
          ...((quote as any).product_type === 'yard_sign' && (quote as any).yard_sign_metadata ? {
            yard_sign_sidedness: (quote as any).yard_sign_metadata.sidedness,
            yard_sign_step_stakes_enabled: (quote as any).yard_sign_metadata.addStepStakes,
            yard_sign_step_stakes_qty: (quote as any).yard_sign_metadata.stepStakeQty,
            yard_sign_design_count: (quote as any).yard_sign_metadata.designCount,
            yard_sign_designs: (quote as any).yard_sign_metadata.designs,
            yard_sign_signs_subtotal_cents: (quote as any).yard_sign_metadata.signSubtotalCents,
            yard_sign_stakes_subtotal_cents: (quote as any).yard_sign_metadata.stakeSubtotalCents,
          } : {}),
          // Design Service fields
          design_service_enabled: (quote as any).design_service_enabled || undefined,
          design_request_text: (quote as any).design_request_text || undefined,
          design_draft_preference: (quote as any).design_draft_preference || undefined,
          design_draft_contact: (quote as any).design_draft_contact || undefined,
          design_uploaded_assets: (quote as any).design_uploaded_assets || undefined,
          // Same-Day Hit Service: capture cart-level selection at add-to-cart time
          sameDayHitServiceSelected: get().sameDayHitService || undefined,
          sameDayHitServicePrice: get().sameDayHitService ? get().getSameDayFeeCents() : undefined,
          ...(aiMetadata || {}),
        };

        // DEBUG: Log design service fields explicitly
        console.log('🎨 [CART STORE] Design service fields in newItem:', {
          design_service_enabled: newItem.design_service_enabled,
          design_request_text: newItem.design_request_text?.substring(0, 50),
          design_draft_preference: newItem.design_draft_preference,
          design_draft_contact: newItem.design_draft_contact,
          design_uploaded_assets_count: newItem.design_uploaded_assets?.length || 0,
          quote_design_service_enabled: (quote as any).design_service_enabled,
        });

        debugLog('🧮 CART: addFromQuote', { usingAuthoritative, pricing, computed: { unit: computedUnit, rope: computedRope, pole: computedPole, line: computedLine }, stored: newItem });
        debugLog('💾 CART STORAGE: Item added, will persist to localStorage');
        get().items.forEach((item, idx) => {
        });
        set((state) => ({ items: [...state.items, newItem] }));

        get().items.forEach((item, idx) => {
        });
        // CRITICAL FIX: Set cart owner to current user
        const userId = cartSync.getUserId();
        if (userId && typeof localStorage !== 'undefined') {
          localStorage.setItem('cart_owner_user_id', userId);
          debugLog('✅ CART: Set cart owner to:', userId);
        }

        const productLabel = newItem.product_type === 'yard_sign'
          ? 'Yard Sign'
          : newItem.product_type === 'car_magnet'
            ? 'Car Magnets'
            : 'Banner';

        // Track add to cart event
        trackAddToCart({
          id: newItem.id,
          name: `${quote.widthIn}x${quote.heightIn} ${quote.material} ${productLabel}`,
          material: quote.material,
          size: `${quote.widthIn}x${quote.heightIn}`,
          price: newItem.line_total_cents,
          quantity: newItem.quantity,
          productType: newItem.product_type,
        });
        
        // Track Facebook Pixel AddToCart
        trackFBAddToCart({
          content_name: `${quote.widthIn}x${quote.heightIn} ${quote.material} ${productLabel}`,
          value: newItem.line_total_cents,
        });
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
        });
        get().syncToServer();
      }, 0);
      return newItem.id;
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
                const perItemPockets = migratedItem.pole_pocket_pricing_mode === 'per_item' ? Math.round((migratedItem.pole_pocket_cost_cents / Math.max(1, migratedItem.quantity)) * quantity) : 0;
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
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
        });
        get().syncToServer();
      }, 0);
      },
      
      loadItemIntoQuote: (itemId: string) => {
        const item = get().items.find(i => i.id === itemId);
        if (!item) return null;
        
        // Return the item so the caller can load it into quote store
        return item;
      },
      
      updateCartItem: (itemId: string, quote: QuoteState, aiMetadata?: any, pricing?: AuthoritativePricing) => {
        debugLog('🔍 [UPDATE CART] Quote state:', {
          addRope: quote.addRope,
          polePockets: quote.polePockets,
          polePocketSize: quote.polePocketSize,
          widthIn: quote.widthIn,
          heightIn: quote.heightIn,
          quantity: quote.quantity
        });
        debugLog('🔍 [UPDATE CART] Authoritative pricing:', pricing);
        
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
        const productType = existingItem.product_type || 'banner';
        const productConfig = getProductConfig(productType);
        const fallbackBannerPricing = productType === 'banner'
          ? calculateBannerPricing({
              widthIn: quote.widthIn,
              heightIn: quote.heightIn,
              quantity: quote.quantity,
              material: quote.material,
              grommets: quote.grommets,
              polePockets: quote.polePockets,
              addRope: quote.addRope,
              ropePlacement: quote.ropePlacement || 'top',
            })
          : null;
        const pricePerSqFt = (productConfig.materialPriceMap as Record<MaterialKey, number>)[quote.material];
        const computedUnit = fallbackBannerPricing
          ? fallbackBannerPricing.unitBasePriceCents
          : Math.max(MINIMUM_UNIT_PRICE_CENTS, Math.round(area * (pricePerSqFt ?? 4.5) * 100));
        const ropeFeet = fallbackBannerPricing ? fallbackBannerPricing.ropeLinearFeet : (quote.addRope ? quote.widthIn / 12 : 0);
        const computedRope = fallbackBannerPricing
          ? fallbackBannerPricing.ropeCostCents
          : Math.round(ropeFeet * 2 * quote.quantity * 100);
        const computedPole = fallbackBannerPricing
          ? fallbackBannerPricing.polePocketCostCents
          : 0;
        const computedLine = fallbackBannerPricing
          ? fallbackBannerPricing.subtotalBeforeDiscountCents
          : computedUnit * quote.quantity + computedRope + computedPole;

        // CRITICAL: Always use authoritative pricing when provided
        // Fallback to computed values only if pricing is not provided
        const unit_price_cents = pricing?.unit_price_cents !== undefined ? pricing.unit_price_cents : computedUnit;
        const rope_cost_cents = pricing?.rope_cost_cents !== undefined ? pricing.rope_cost_cents : computedRope;
        const rope_pricing_mode: PricingMode = pricing?.rope_pricing_mode ?? 'per_item';
        const pole_pocket_cost_cents = pricing?.pole_pocket_cost_cents !== undefined ? pricing.pole_pocket_cost_cents : computedPole;
        const pole_pocket_pricing_mode: PricingMode = pricing?.pole_pocket_pricing_mode ?? 'per_item';
        const line_total_cents = pricing?.line_total_cents !== undefined ? pricing.line_total_cents : computedLine;
        
        debugLog('🔍 [ADD TO CART] Computed fallback values:', {
          computedUnit,
          computedRope,
          computedPole,
          computedLine
        });
        
        debugLog('🔍 [UPDATE CART] Final pricing values:', {
          unit_price_cents,
          rope_cost_cents,
          pole_pocket_cost_cents,
          line_total_cents,
          ropeFeet,
          usingAuthoritative,
          pricingProvided: !!pricing
        });
        
        debugLog('🔍 [UPDATE CART] Pricing object received:', pricing);
        debugLog('🔍 [UPDATE CART] Computed fallback pole pocket cost:', computedPole);
        debugLog('🔍 [UPDATE CART] Final pole_pocket_cost_cents to be saved:', pole_pocket_cost_cents);
        debugLog('🔍 [UPDATE CART] Quote polePockets value:', quote.polePockets);

        // Use the file key from the uploaded file
        const fileKey = quote.file?.fileKey;
        const nextPlacement = (quote as any).placementPreview as PlacementPreviewManifest | undefined;
        const nextProductType = (quote as any).product_type || existingItem.product_type || 'banner';
        if (nextPlacement && !isReadyPlacementPreview(nextPlacement)) {
          console.error('❌ CART: Refusing to replace an item with a non-ready exact preview', {
            itemId,
            compositionSignature: nextPlacement.compositionSignature,
            uploadStatus: nextPlacement.uploadStatus,
          });
          throw new PreviewLifecycleError(
            'PERMANENT_PREVIEW_UNAVAILABLE',
            'Refusing to replace a cart item with a non-ready exact preview.',
          );
        }
        if (nextPlacement && (
          nextPlacement.productType !== nextProductType
          || nextPlacement.widthIn !== quote.widthIn
          || nextPlacement.heightIn !== quote.heightIn
        )) {
          throw new PreviewLifecycleError(
            'COMPOSITION_CHANGED',
            'The replacement preview identity does not match the cart line update.',
            {
              nextProductType,
              nextWidthIn: quote.widthIn,
              nextHeightIn: quote.heightIn,
              previewProductType: nextPlacement.productType,
              previewWidthIn: nextPlacement.widthIn,
              previewHeightIn: nextPlacement.heightIn,
            },
          );
        }
        const exactPreviewUrl = nextPlacement?.previewUrl;
        const replacingExistingCanonicalPreview = Boolean(existingItem.placement_preview);
        const yardMetadata = nextProductType === 'yard_sign'
          ? (quote as any).yard_sign_metadata
          : null;

        // Update the item with new data
        const updatedItem: CartItem = {
          ...existingItem,
          product_type: nextProductType,
          width_in: quote.widthIn,
          height_in: quote.heightIn,
          quantity: quote.quantity,
          material: quote.material,
          grommets: quote.grommets,
          pole_pockets: quote.polePockets,
          pole_pocket_size: quote.polePocketSize,
          pole_pocket_position: quote.polePockets,
          rounded_corners: (quote as any).rounded_corners || existingItem.rounded_corners || null,
          rope_feet: ropeFeet,
          rope_placement: quote.addRope ? (quote.ropePlacement || 'top') : null,
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
          // CRITICAL FIX: Never use thumbnailUrl for file_url - thumbnailUrl has grommets baked in
          file_url: ((quote.file as any)?.productionUrl
            || (quote.file as any)?.originalUrl
            || ((quote.file?.url?.startsWith('blob:') || quote.file?.url?.startsWith('data:')) ? null : quote.file?.url))
            || aiMetadata?.assets?.proofUrl
            || existingItem.file_url,
          thumbnail_url: exactPreviewUrl
            || (replacingExistingCanonicalPreview ? undefined : (quote as any).thumbnailUrl)
            || (replacingExistingCanonicalPreview ? undefined : existingItem.thumbnail_url),
          web_preview_url: exactPreviewUrl
            || (replacingExistingCanonicalPreview ? undefined : (quote as any).webPreviewUrl)
            || (replacingExistingCanonicalPreview ? undefined : aiMetadata?.assets?.proofUrl)
            || (replacingExistingCanonicalPreview ? undefined : existingItem.web_preview_url),
          print_ready_url: aiMetadata?.assets?.finalUrl || existingItem.print_ready_url,
          is_pdf: quote.file?.isPdf || false,
          text_elements: quote.textElements && quote.textElements.length > 0 ? quote.textElements : undefined,
          overlay_image: quote.overlayImage ? {
            ...quote.overlayImage,
            position: quote.overlayImage.position || { x: 50, y: 50 }
          } : undefined,
          overlay_images: (quote as any).overlayImages ? (quote as any).overlayImages : undefined, // NEW: Save multiple images
          canva_design_id: (quote as any).canvaDesignId || undefined,
          canvas_background_color: (quote as any).canvasBackgroundColor || '#FFFFFF',
          image_scale: quote.imageScale || 1,
          image_scale_y: (quote as any).imageScaleY ?? quote.imageScale ?? 1,
          image_position: quote.imagePosition || { x: 0, y: 0 },
          fit_mode: quote.fitMode || 'fill',
          // FINAL_RENDER: High-res snapshot for admin PDF
          final_render_url: (quote as any).finalRenderUrl || existingItem.final_render_url,
          final_render_file_key: (quote as any).finalRenderFileKey || existingItem.final_render_file_key,
          final_render_width_px: (quote as any).finalRenderWidthPx || existingItem.final_render_width_px,
          final_render_height_px: (quote as any).finalRenderHeightPx || existingItem.final_render_height_px,
          final_render_dpi: (quote as any).finalRenderDpi || existingItem.final_render_dpi,
          canvas_state_json: (quote as any).canvasStateJson || existingItem.canvas_state_json,
          artwork_manifest: (quote as any).artworkManifest || existingItem.artwork_manifest,
          // A canonical artifact may only survive an edit when that exact edit
          // supplied it again. Reusing the previous placement after a source,
          // transform, or dimension change can put stale artwork into checkout.
          placement_preview: nextPlacement,
          composition_signature: nextPlacement?.compositionSignature,
          composition_revision: nextPlacement?.compositionRevision,
          yard_sign_sidedness: yardMetadata?.sidedness,
          yard_sign_step_stakes_enabled: yardMetadata?.addStepStakes,
          yard_sign_step_stakes_qty: yardMetadata?.stepStakeQty,
          yard_sign_design_count: yardMetadata?.designCount,
          yard_sign_designs: yardMetadata?.designs,
          yard_sign_signs_subtotal_cents: yardMetadata?.signSubtotalCents,
          yard_sign_stakes_subtotal_cents: yardMetadata?.stakeSubtotalCents,
          // Design Service fields
          design_service_enabled: (quote as any).design_service_enabled || existingItem.design_service_enabled,
          design_request_text: (quote as any).design_request_text || existingItem.design_request_text,
          design_draft_preference: (quote as any).design_draft_preference || existingItem.design_draft_preference,
          design_draft_contact: (quote as any).design_draft_contact || existingItem.design_draft_contact,
          design_uploaded_assets: (quote as any).design_uploaded_assets || existingItem.design_uploaded_assets,
          ...(aiMetadata || {}),
        };

        debugLog('✅ CART: updateCartItem success', { updatedItem });
        
        // CRITICAL FIX: Set cart owner to current user
        const userId = cartSync.getUserId();
        if (userId && typeof localStorage !== 'undefined') {
          localStorage.setItem('cart_owner_user_id', userId);
          debugLog('✅ CART: Set cart owner to:', userId);
        }
        
        set((state) => ({
          items: state.items.map(item => item.id === itemId ? updatedItem : item)
        }));
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
        });
        get().syncToServer();
      }, 0);
      },
      applyCanonicalPricingQuote: (quote: CanonicalCartQuote): boolean => {
        const currentState = get();
        const currentItems = currentState.items;
        if (!quote || !Array.isArray(quote.items) || quote.items.length !== currentItems.length) {
          return false;
        }
        const totalsAreValid = [
          quote.subtotalCents,
          quote.taxCents,
          quote.shippingCents,
          quote.totalCents,
          quote.appliedDiscountCents,
        ].every((value) => Number.isInteger(value) && value >= 0);
        if (!totalsAreValid) return false;

        const canonicalById = new Map(quote.items.map((line) => [String(line.cartItemId), line]));
        const resolvedLines = currentItems.map((item, index) => {
          const line = canonicalById.get(String(item.id)) || quote.items[index];
          if (!line) return null;
          const sameIdentity = Number(line.index) === index
            && String(line.cartItemId) === String(item.id)
            && String(line.productType || 'banner') === String(item.product_type || 'banner');
          const centsAreValid = [
            line.unitPriceCents,
            line.lineTotalCents,
            line.ropeCostCents,
            line.polePocketCostCents,
          ].every((value) => Number.isInteger(value) && value >= 0);
          return sameIdentity && centsAreValid && Number.isFinite(line.ropeFeet) && line.ropeFeet >= 0
            ? line
            : null;
        });
        if (resolvedLines.some((line) => !line)) return false;

        // Apply the candidate line fields to a local projection first. A quote
        // may differ because an active promo definition or a service fee changed,
        // neither of which can be faithfully repaired by replacing line prices.
        // Never partially mutate the cart or claim success in that case.
        const projectedItems = currentItems.map((item, index) => {
          const line = resolvedLines[index] as CanonicalCartQuoteLine;
          return migrateCartItem({
            ...item,
            unit_price_cents: line.unitPriceCents,
            line_total_cents: line.lineTotalCents,
            rope_feet: line.ropeFeet,
            rope_cost_cents: line.ropeCostCents,
            pole_pocket_cost_cents: line.polePocketCostCents,
            yard_sign_signs_subtotal_cents: typeof line.yardSignSignsSubtotalCents === 'number'
              && Number.isInteger(line.yardSignSignsSubtotalCents)
              ? line.yardSignSignsSubtotalCents
              : item.yard_sign_signs_subtotal_cents,
            yard_sign_stakes_subtotal_cents: typeof line.yardSignStakesSubtotalCents === 'number'
              && Number.isInteger(line.yardSignStakesSubtotalCents)
              ? line.yardSignStakesSubtotalCents
              : item.yard_sign_stakes_subtotal_cents,
          });
        });
        const rawSubtotalCents = projectedItems.reduce(
          (sum, item) => sum + Number(item.line_total_cents || 0),
          0,
        );
        const pricingOptions = getPricingOptions();
        const projectedSubtotalCents = Math.max(rawSubtotalCents, pricingOptions.minFloorCents || 0);
        const bannerItems = projectedItems.filter((item) => {
          const productType = item.product_type || 'banner';
          return productType !== 'yard_sign' && productType !== 'car_magnet';
        });
        const bannerQuantity = bannerItems.reduce(
          (sum, item) => sum + Number(item.quantity || 1),
          0,
        );
        const bannerSubtotalCents = bannerItems.reduce(
          (sum, item) => sum + Number(item.line_total_cents || 0),
          0,
        );
        const currentDiscount = currentState.discountCode;
        const projectedPromoDiscount: PromoDiscountInput | null = currentDiscount ? {
          code: currentDiscount.code,
          discountPercentage: currentDiscount.discountPercentage,
          discountAmountCents: currentDiscount.discountAmountCents || undefined,
          campaign: currentDiscount.campaign,
          discountScope: currentDiscount.discountScope,
          eligibleCartItemIds: currentDiscount.eligibleCartItemIds,
          maxDiscountAmountCents: currentDiscount.maxDiscountAmountCents,
        } : null;
        const projectedDiscount = resolveBestDiscount({
          subtotalCents: projectedSubtotalCents,
          quantity: bannerQuantity,
          quantitySubtotalCents: bannerSubtotalCents,
          promoDiscount: projectedPromoDiscount,
          promoSubtotalCents: getPromoDiscountSubtotalCents(
            projectedItems,
            projectedSubtotalCents,
            projectedPromoDiscount,
          ),
          automaticDiscountBaseCents: getAutomaticLargeBannerSubtotalCents(projectedItems),
        });
        const subtotalAfterDiscountCents = projectedSubtotalCents
          - projectedDiscount.appliedDiscountAmountCents;
        const projectedTaxCents = Math.round(calculateTax(subtotalAfterDiscountCents / 100) * 100);
        const projectedShippingCents = 0;
        const projectedFees = currentState.sameDayHitService
          ? computeSameDayFeesCents(getEligibleSubtotalCents(projectedItems), {
              sameDay: true,
              saturday: currentState.saturdayDelivery,
            })
          : { sameDayFeeCents: 0, saturdayFeeCents: 0 };
        const projectedTotalCents = Math.max(
          0,
          subtotalAfterDiscountCents
            + projectedTaxCents
            + projectedShippingCents
            + projectedFees.sameDayFeeCents
            + projectedFees.saturdayFeeCents,
        );
        const normalizedCode = (value?: string | null) => {
          const code = String(value || '').trim().toUpperCase();
          return code || null;
        };
        const canonicalSameDayFeeCents = quote.sameDayFeeCents ?? 0;
        const canonicalSaturdayFeeCents = quote.saturdayFeeCents ?? 0;
        const canonicalAggregatesValid = [canonicalSameDayFeeCents, canonicalSaturdayFeeCents]
          .every((value) => Number.isInteger(value) && value >= 0);
        const canonicalMatchesProjection = canonicalAggregatesValid
          && quote.subtotalCents === projectedSubtotalCents
          && quote.appliedDiscountCents === projectedDiscount.appliedDiscountAmountCents
          && String(quote.appliedDiscountType || 'none').toLowerCase() === projectedDiscount.appliedDiscountType
          && normalizedCode(quote.discountCode) === normalizedCode(currentDiscount?.code)
          && quote.taxCents === projectedTaxCents
          && quote.shippingCents === projectedShippingCents
          && canonicalSameDayFeeCents === projectedFees.sameDayFeeCents
          && canonicalSaturdayFeeCents === projectedFees.saturdayFeeCents
          && quote.totalCents === projectedTotalCents;
        if (!canonicalMatchesProjection) return false;

        set((state) => ({
          items: state.items.map((item, index) => {
            const line = resolvedLines[index] as CanonicalCartQuoteLine;
            return {
              ...item,
              unit_price_cents: line.unitPriceCents,
              line_total_cents: line.lineTotalCents,
              rope_feet: line.ropeFeet,
              rope_cost_cents: line.ropeCostCents,
              pole_pocket_cost_cents: line.polePocketCostCents,
              yard_sign_signs_subtotal_cents: typeof line.yardSignSignsSubtotalCents === 'number'
                && Number.isInteger(line.yardSignSignsSubtotalCents)
                ? line.yardSignSignsSubtotalCents
                : item.yard_sign_signs_subtotal_cents,
              yard_sign_stakes_subtotal_cents: typeof line.yardSignStakesSubtotalCents === 'number'
                && Number.isInteger(line.yardSignStakesSubtotalCents)
                ? line.yardSignStakesSubtotalCents
                : item.yard_sign_stakes_subtotal_cents,
            };
          }),
        }));

        // Persist the authoritative display prices for reload parity. Payment
        // still performs a fresh server reprice before any new authorization.
        setTimeout(() => { void get().syncToServer(); }, 0);
        return true;
      },
      removeItem: (id: string) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== id)
        }));
        if (get().items.length === 0) {
          writeStoredAbandonedCartRecoveryAttribution(null);
        }
        // After item changes, ensure Same-Day flags are still valid (e.g. if
        // the removed item was the only eligible product in the cart).
        get().reconcileSameDayHitService();
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
        });
        get().syncToServer();
      }, 0);
      },

      clearCart: () => {
        set({ items: [], discountCode: null, sameDayHitService: false, saturdayDelivery: false });
        writeStoredAbandonedCartRecoveryAttribution(null);
      // CRITICAL FIX: Sync to Neon database AFTER state update completes
      // Use setTimeout to ensure state has been updated before syncing
      setTimeout(() => {
        const itemsToSync = get().items;
        // DEBUG: Log thumbnail_url for each item
        itemsToSync.forEach((item, idx) => {
        });
        get().syncToServer();
      }, 0);
      },

      clearCartLocal: () => {
        set({ items: [], discountCode: null, sameDayHitService: false, saturdayDelivery: false });
        writeStoredAbandonedCartRecoveryAttribution(null);
      },

      replaceItemsFromRecovery: async (recoveredItems: CartItem[]) => {
        const items = Array.isArray(recoveredItems)
          ? recoveredItems
              .filter((item) => item && !isRetiredCampaignItem(item))
              .map(migrateCartItem)
          : [];
        if (items.length === 0) {
          throw new Error('Recovered cart did not contain any supported items');
        }

        // Recovery is a deliberate replacement, not a merge. This prevents a
        // stale local/account cart from being combined with the signed email
        // snapshot, and prevents an unrelated promo from carrying over.
        set({
          items,
          discountCode: null,
          sameDayHitService: false,
          saturdayDelivery: false,
        });
        await get().syncToServer();
      },

      applyDiscountCode: (discount: DiscountCode) => {
        set({ discountCode: discount });
      },

      removeDiscountCode: () => {
        set({ discountCode: null });
      },

      // Uses "Best Discount Wins" logic - only returns the single best discount amount
      getDiscountAmountCents: () => {
        const resolved = get().getResolvedDiscount();
        return resolved.appliedDiscountAmountCents;
      },

      

      // Sync cart to Neon database (for logged-in users)
      syncToServer: async () => {
        // Set syncing flag to prevent loadFromServer from overwriting during sync
        set({ isSyncing: true });
        debugLog('🔄 SYNC: Starting sync, isSyncing = true');
        
        try {
        const userId = cartSync.getUserId();
        const rawItems = get().items.filter((item) => !isRetiredCampaignItem(item));
        if (rawItems.length !== get().items.length) {
          set({ items: rawItems });
        }
        
        // Helper to check if a string is a bad URL (blob, data, or too large)
        const isBadUrl = (url: string | undefined | null): boolean => {
          if (!url || typeof url !== 'string') return false;
          return url.startsWith('blob:') || url.startsWith('data:') || url.length > 10000;
        };
        
        // CRITICAL: Strip out blob/data URLs before syncing - they're too large for the database
        const items = rawItems.map(item => {
          const cleaned = { ...item };
          if (isReadyPlacementPreview(cleaned.placement_preview)) {
            const exactUrl = cleaned.placement_preview.previewUrl;
            cleaned.thumbnail_url = exactUrl;
            cleaned.web_preview_url = exactUrl;
            cleaned.composition_signature = cleaned.placement_preview.compositionSignature;
            cleaned.composition_revision = cleaned.placement_preview.compositionRevision;
          } else if (cleaned.placement_preview) {
            const previewUrl = cleaned.placement_preview.previewUrl || cleaned.placement_preview.url;
            if (isBadUrl(previewUrl)) cleaned.placement_preview = undefined;
          }
          // DEBUG: Log thumbnail_url before cleaning
          debugLog('[syncToServer] Item thumbnail_url BEFORE cleaning:', {
            id: item.id,
            thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 100) : 'NULL',
            isBlob: item.thumbnail_url?.startsWith('blob:'),
            isData: item.thumbnail_url?.startsWith('data:'),
            length: item.thumbnail_url?.length
          });
          // Remove bad URLs from all URL fields
          if (isBadUrl(cleaned.thumbnail_url)) {
            debugLog('[syncToServer] ⚠️ STRIPPING bad thumbnail_url:', item.thumbnail_url?.substring(0, 50));
            cleaned.thumbnail_url = undefined;
          }
          if (isBadUrl(cleaned.file_url)) {
            debugLog('[syncToServer] Stripping bad file_url');
            cleaned.file_url = undefined;
          }
          if (isBadUrl(cleaned.web_preview_url)) {
            debugLog('[syncToServer] Stripping bad web_preview_url');
            cleaned.web_preview_url = undefined;
          }
          if (isBadUrl(cleaned.print_ready_url)) {
            debugLog('[syncToServer] Stripping bad print_ready_url');
            cleaned.print_ready_url = undefined;
          }
          // Clean overlay_image
          if (cleaned.overlay_image?.url && isBadUrl(cleaned.overlay_image.url)) {
            debugLog('[syncToServer] Stripping bad overlay_image.url');
            cleaned.overlay_image = { ...cleaned.overlay_image, url: undefined };
          }
          // Clean overlay_images array
          if (Array.isArray(cleaned.overlay_images)) {
            cleaned.overlay_images = cleaned.overlay_images.map(img => {
              if (img?.url && isBadUrl(img.url)) {
                debugLog('[syncToServer] Stripping bad overlay_images[].url');
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
          debugLog('👤 No user logged in - saving guest cart with session ID:', sessionId ? `${sessionId.substring(0, 12)}...` : 'none');
          
          if (sessionId) {
            const success = await cartSync.saveCart(items, undefined, sessionId);
            if (success) {
            } else {
              console.error('❌ STORE: Failed to sync guest cart to server');
            }
          }
          return;
        }
        
        const success = await cartSync.saveCart(items, userId);
        if (success) {
        } else {
          console.error('❌ STORE: Failed to sync cart to server - cart will remain in localStorage');
        }
        } finally {
          // Always reset syncing flag when done
          set({ isSyncing: false });
          debugLog('🔄 SYNC: Sync complete, isSyncing = false');
        }
      },

      // Load cart from Neon database and merge with local
      loadFromServer: async () => {
        const hydrationTicket = captureAccountCartHydrationTicket();
        if (!canStartAccountCartHydration(hydrationTicket)) {
          return;
        }

        // CRITICAL: Skip loading if a sync is in progress to prevent race conditions
        if (get().isSyncing) {
          return;
        }
        const userId = cartSync.getUserId();
        
        if (!userId) {
          return;
        }

        const loadedServerItems = await cartSync.loadCart(userId);
        // A signed recovery that began while this request was in flight owns
        // the cart. Never let a late focus/login hydration overwrite it.
        if (!canCommitAccountCartHydration(hydrationTicket)) {
          return;
        }
        const serverItems = loadedServerItems.filter((item) => !isRetiredCampaignItem(item));
        const localItems = get().items.filter((item) => !isRetiredCampaignItem(item));
        const removedRetiredItems = (
          loadedServerItems.length !== serverItems.length
          || get().items.length !== localItems.length
        );
        if (get().items.length !== localItems.length) {
          set({ items: localItems });
        }
        const cartOwnerId = typeof localStorage !== 'undefined' ? localStorage.getItem('cart_owner_user_id') : null;
        
        
        // CRITICAL FIX: Do NOT merge local items with server items!
        // This was causing cross-account cart pollution.
        // Server is the source of truth - just use server items.
        if (serverItems.length > 0) {
          // CRITICAL: Use ONLY server items - no merging with local items
          // Local items may belong to a different user
          set({ items: serverItems });
          if (removedRetiredItems) {
            setTimeout(() => get().syncToServer(), 100);
          }
          
          // Set cart owner
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('cart_owner_user_id', userId);
          }
          return;
        }
        
        // Server cart is empty
        // CRITICAL FIX: When server cart is empty, ALWAYS clear local cart
        // This prevents cross-account pollution where User A's items get synced to User B
        // The only exception is if we're CERTAIN the local cart belongs to this user
        if (localItems.length > 0) {
          // ONLY keep local items if cartOwnerId EXACTLY matches current user
          // Do NOT keep items if cartOwnerId is null (could be stale from another user)
          if (cartOwnerId === userId) {
            // Set cart owner to current user
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('cart_owner_user_id', userId);
            }
            // Save local cart to server
            setTimeout(() => get().syncToServer(), 100);
            return;
          } else {
            // cartOwnerId is null OR belongs to different user - CLEAR IT
            set({ items: [] });
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('cart_owner_user_id', userId);
            }
            return;
          }
        }
        // Both server and local are empty
      },

      getMigratedItems: () => {
        return get().items.map(migrateCartItem);
      },

      // NOTE: getSubtotalCents returns the RAW subtotal (before quantity discount)
      // This is needed for displaying the original subtotal before discounts
      getSubtotalCents: () => {
        const flags = getFeatureFlags();
        const items = get().items.map(migrateCartItem); // Migrate items before calculating

        if (flags.freeShipping || flags.minOrderFloor) {
          const pricingOptions = getPricingOptions();
          const pricingItems: PricingItem[] = items.map(item => ({
            line_total_cents: item.line_total_cents,
            quantity: item.quantity
          }));
          const totals = computeTotals(pricingItems, 0.06, pricingOptions);
          return totals.adjusted_subtotal_cents;
        }

        return items.reduce((total, item) => total + item.line_total_cents, 0);
      },

      // Tax calculated AFTER applying the single best discount
      getTaxCents: () => {
        const rawSubtotal = get().getSubtotalCents();
        const resolved = get().getResolvedDiscount();
        const subtotalAfterDiscount = rawSubtotal - resolved.appliedDiscountAmountCents;
        return Math.round(calculateTax(subtotalAfterDiscount / 100) * 100);
      },

      // Total = subtotal - best discount + tax + same-day fees (no stacking)
      getTotalCents: () => {
        const rawSubtotal = get().getSubtotalCents();
        const resolved = get().getResolvedDiscount();
        const subtotalAfterDiscount = rawSubtotal - resolved.appliedDiscountAmountCents;
        const tax = Math.round(calculateTax(subtotalAfterDiscount / 100) * 100);
        // Same-Day Hit Service and Saturday Delivery fees are added AFTER tax
        // and do NOT affect the existing tax base or free next-day shipping.
        const sameDayFee = get().getSameDayFeeCents();
        const saturdayFee = get().getSaturdayDeliveryFeeCents();
        return Math.max(0, subtotalAfterDiscount + tax + sameDayFee + saturdayFee);
      },


      getItemCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },

      // Get quantity discount info for "Buy More, Save More" display
      // IMPORTANT: Only banner items participate in quantity discounts
      getQuantityDiscountInfo: () => {
        const items = get().items.map(migrateCartItem);
        const bannerItems = items.filter(item => {
          const t = item.product_type || 'banner';
          return t !== 'yard_sign' && t !== 'car_magnet';
        });
        const totalQuantity = bannerItems.reduce((total, item) => total + item.quantity, 0);
        const rawSubtotal = bannerItems.reduce((total, item) => total + item.line_total_cents, 0);

        const discountResult = calculateQuantityDiscount(rawSubtotal, totalQuantity);

        return {
          totalQuantity,
          discountRate: discountResult.discountRate,
          discountCents: discountResult.discountCents,
        };
      },

      // Best Discount Resolver - "Best Discount Wins" (no stacking)
      // IMPORTANT: ONLY banner items participate in quantity discounts.
      // Yard signs and car magnets do NOT contribute to the quantity discount tier and the quantity
      // discount rate is NOT applied to their subtotal. Promo codes still apply
      // to the full cart subtotal.
      getResolvedDiscount: () => {
        const items = get().items.map(migrateCartItem);
        const subtotalCents = items.reduce((total, item) => total + item.line_total_cents, 0);

        // Banner-only subset for quantity-discount tier + base
        const isBanner = (item: any) => {
          const t = item.product_type || 'banner';
          return t !== 'yard_sign' && t !== 'car_magnet';
        };
        const bannerItems = items.filter(isBanner);
        const bannerQuantity = bannerItems.reduce((total, item) => total + item.quantity, 0);
        const bannerSubtotalCents = bannerItems.reduce(
          (total, item) => total + item.line_total_cents,
          0,
        );

        const discountCode = get().discountCode;
        const promoDiscount: PromoDiscountInput | null = discountCode ? {
          code: discountCode.code,
          discountPercentage: discountCode.discountPercentage,
          discountAmountCents: discountCode.discountAmountCents || undefined,
          campaign: discountCode.campaign,
          discountScope: discountCode.discountScope,
          eligibleCartItemIds: discountCode.eligibleCartItemIds,
          maxDiscountAmountCents: discountCode.maxDiscountAmountCents,
        } : null;

        return resolveBestDiscount({
          subtotalCents,
          quantity: bannerQuantity,
          quantitySubtotalCents: bannerSubtotalCents,
          promoDiscount,
          promoSubtotalCents: getPromoDiscountSubtotalCents(items, subtotalCents, promoDiscount),
          automaticDiscountBaseCents: getAutomaticLargeBannerSubtotalCents(items),
        });
      }
    }),
    {
      name: 'cart-storage',
      // CRITICAL: Do NOT persist items array to localStorage
      // Items should ONLY come from the server (database)
      // This prevents showing wrong user's cart after login
      partialize: (state) => {
        // Get the current user ID to store with the cart
        let cartOwnerId = null;
        if (typeof localStorage !== 'undefined') {
          cartOwnerId = localStorage.getItem('cart_owner_user_id');
        }
        return {
          // NOTE: discountCode is intentionally NOT persisted. Promo codes must
          // be entered/applied per session to prevent cross-session and
          // cross-account auto-application (e.g. NEW20 leaking into new carts).
          // CRITICAL FIX: Persist items to localStorage as a cache
          // This prevents items from being lost during page navigation (e.g., Canva flow)
          // Server is still the source of truth - loadFromServer() will update/merge
          items: state.items.map((item) => ({
            ...item,
            thumbnail_url: item.thumbnail_url?.startsWith('data:') || item.thumbnail_url?.startsWith('blob:')
              ? undefined
              : item.thumbnail_url,
            placement_preview: item.placement_preview && (
              item.placement_preview.previewUrl?.startsWith('data:')
              || item.placement_preview.previewUrl?.startsWith('blob:')
              || item.placement_preview.url?.startsWith('data:')
              || item.placement_preview.url?.startsWith('blob:')
            ) ? undefined : item.placement_preview,
            yard_sign_designs: item.yard_sign_designs?.map((design) => ({
              ...design,
              previewThumbnailUrl: design.previewThumbnailUrl?.startsWith('data:')
                || design.previewThumbnailUrl?.startsWith('blob:')
                ? undefined
                : design.previewThumbnailUrl,
              placementPreview: design.placementPreview && (
                design.placementPreview.previewUrl?.startsWith('data:')
                || design.placementPreview.previewUrl?.startsWith('blob:')
                || design.placementPreview.url?.startsWith('data:')
                || design.placementPreview.url?.startsWith('blob:')
              ) ? undefined : design.placementPreview,
            })),
            canvas_state_json: item.canvas_state_json
              ? (() => {
                  try {
                    const scene = JSON.parse(item.canvas_state_json);
                    if (scene.previewUrl?.startsWith('blob:') || scene.previewUrl?.startsWith('data:')) delete scene.previewUrl;
                    return JSON.stringify(scene);
                  } catch { return item.canvas_state_json; }
                })()
              : undefined,
          })),
          // Same-Day Hit Service and Saturday Delivery flags are intentionally
          // NOT trusted from local persistence. They default OFF on refresh;
          // only a signed server recovery can request them, and the dedicated
          // restore action revalidates the current ET window and cart first.
          // Store cart owner for rehydration check
          _cartOwnerId: cartOwnerId,
        };
      },
      // Items ARE persisted to localStorage as a cache for page navigation
      // Server is the source of truth - useCartSync loads/merges from server
            onRehydrateStorage: () => (state) => {
        debugLog('💾 CART STORAGE: Rehydrating from localStorage...');
        debugLog('💾 CART STORAGE: Items count after rehydration:', state?.items?.length ?? 0);
        
        // CRITICAL FIX: Check if the cart belongs to the current user
        // Use BOTH localStorage cart_owner_user_id AND the stored _cartOwnerId
        if (typeof localStorage !== 'undefined') {
          const storedCartOwnerId = (state as any)?._cartOwnerId;
          const lsCartOwnerId = localStorage.getItem('cart_owner_user_id');
          const cartOwnerId = storedCartOwnerId || lsCartOwnerId;
          const currentUserStr = localStorage.getItem('banners_current_user');
          let currentUserId = null;
          try {
            if (currentUserStr) {
              currentUserId = JSON.parse(currentUserStr)?.id;
            }
          } catch (e) {
            console.error('💾 CART STORAGE: Error parsing current user:', e);
          }
          
          debugLog('💾 CART STORAGE: Current user ID:', currentUserId);
          
          // If cart belongs to a different user, clear it
          if (cartOwnerId && currentUserId && cartOwnerId !== currentUserId) {
            if (state) {
              state.items = [];
            }
            localStorage.removeItem('cart_owner_user_id');
          }
          
          // ALSO: If user is logged in but cart has NO owner, clear it (might be stale guest cart)
          if (currentUserId && !cartOwnerId && state?.items?.length) {
            if (state) {
              state.items = [];
            }
          }
          
          // ALSO: If there are items but no user logged in, keep them (guest cart is OK)
          // But log it for debugging
          if (!currentUserId && state?.items?.length) {
          }
          
          // ALSO: If user is logged in but cart has NO owner, clear it (might be stale guest cart)
          if (currentUserId && !cartOwnerId && state?.items?.length) {
            if (state) {
              state.items = [];
            }
          }
          
          // ALSO: If there are items but no user logged in, keep them (guest cart is OK)
          // But log it for debugging
          if (!currentUserId && state?.items?.length) {
          }
        }
        
        if (state?.items?.length) {
          state.items.forEach((item, idx) => {
            debugLog('💾 CART STORAGE: Rehydrated item ' + idx + ': ' + item.id);
          });
        }
        // Same-Day Hit Service and Saturday Delivery flags are never
        // restored from localStorage — they always start OFF on rehydrate,
        // matching the in-memory default in the store initializer. This
        // belt-and-suspenders clears any flags lingering from older builds
        // that did persist them.
        if (state) {
          state.sameDayHitService = false;
          state.saturdayDelivery = false;
        }
      },
    }
  )
);
