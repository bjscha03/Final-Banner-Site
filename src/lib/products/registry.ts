/**
 * Product Type Registry
 * 
 * Central configuration for all product types.
 * Phase 1: Contains ONLY the existing "banner" product.
 * All values are extracted from existing hardcoded logic — no new behavior.
 * 
 * Future product types (e.g., yard signs) can be added here
 * without modifying pricing, cart, or checkout logic.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ProductTypeSlug = 'banner' | 'yard_sign';

export interface MaterialConfig {
  key: string;
  label: string;
  pricePerSqFt: number; // dollars per square foot
}

export interface GrommetOption {
  value: string;
  label: string;
  description: string;
}

export interface PolePocketOption {
  value: string;
  label: string;
}

export interface DimensionsConfig {
  defaultWidthIn: number;
  defaultHeightIn: number;
  resetWidthIn: number;
  resetHeightIn: number;
  minIn: number;
  maxIn: number;
  maxSqFt: number;
  sizeLimitMessage: string;
}

export interface RopeConfig {
  available: boolean;
  pricePerFootCents: number;  // cents per linear foot
  pricingMode: 'per_item' | 'per_order';
}

export interface PolePocketConfig {
  available: boolean;
  setupFeeCents: number;       // one-time setup fee in cents
  pricePerLinearFootCents: number; // cents per linear foot
  pricingMode: 'per_item' | 'per_order';
  positions: PolePocketOption[];
  sizes: string[];
  defaultSize: string;
}

export interface PrintConfig {
  idealDpi: number;
  minDpi: number;
  maxTotalPixels: number;
  format: 'jpeg' | 'pdf';
  jpegQuality: number;
}

export interface EditorConfig {
  defaultFitMode: 'fill' | 'fit' | 'stretch';
  defaultImageScale: number;
  defaultImagePosition: { x: number; y: number };
  defaultCanvasBackgroundColor: string;
  supportsTextElements: boolean;
  supportsOverlayImages: boolean;
  supportsDesignService: boolean;
}

/**
 * Predefined size option with flat-rate pricing.
 * Used by products like yard signs that have fixed size/price combos.
 */
export interface PredefinedSize {
  label: string;         // e.g. '18" × 24"'
  widthIn: number;
  heightIn: number;
  basePriceCents: number; // base price in cents for the default material
}

/**
 * Material multiplier for flat-rate pricing.
 * Applied on top of the base price defined in PredefinedSize.
 */
export interface MaterialMultiplier {
  key: string;
  label: string;
  multiplier: number; // e.g. 1.0 for base, 1.4 for +40%
}

export interface ProductTypeConfig {
  slug: ProductTypeSlug;
  name: string;
  description: string;
  dimensions: DimensionsConfig;
  materials: MaterialConfig[];
  materialPriceMap: Record<string, number>;  // key → pricePerSqFt (dollars)
  minimumUnitPriceDollars: number;
  minimumUnitPriceCents: number;
  grommets: GrommetOption[];
  rope: RopeConfig;
  polePockets: PolePocketConfig;
  quantityDiscountTiers: Array<{
    minQuantity: number;
    discountRate: number;
    label: string;
  }>;
  taxRate: number;
  print: PrintConfig;
  editor: EditorConfig;

  // --- Flat-rate pricing (optional, used by yard signs etc.) ---
  /** When 'flat_rate', pricing uses predefinedSizes + materialMultipliers instead of sqft */
  pricingModel?: 'per_sqft' | 'flat_rate';
  /** Fixed size/price options (only for flat_rate products) */
  predefinedSizes?: PredefinedSize[];
  /** Material multipliers applied to base price (only for flat_rate products) */
  materialMultipliers?: MaterialMultiplier[];
  /** Whether custom dimensions are allowed (false for yard signs) */
  allowCustomDimensions?: boolean;
  /** Free shipping message to display */
  freeShippingMessage?: string;
}

// ============================================================================
// BANNER PRODUCT CONFIGURATION
// All values extracted from existing code — no new behavior
// ============================================================================

const bannerProduct: ProductTypeConfig = {
  slug: 'banner',
  name: 'Custom Banner',
  description: 'Custom vinyl banners with optional grommets, rope, and pole pockets',

  dimensions: {
    defaultWidthIn: 48,
    defaultHeightIn: 24,
    resetWidthIn: 60,
    resetHeightIn: 36,
    minIn: 6,
    maxIn: 600,   // 50 feet
    maxSqFt: 1000,
    sizeLimitMessage: 'Orders over 1,000 sq ft require a custom quote. Please contact us at (555) 123-4567 or support@bannersonthefly.com before placing your order.',
  },

  materials: [
    { key: '13oz', label: '13oz Vinyl', pricePerSqFt: 4.5 },
    { key: '15oz', label: '15oz Vinyl', pricePerSqFt: 6.0 },
    { key: '18oz', label: '18oz Vinyl', pricePerSqFt: 7.5 },
    { key: 'mesh', label: 'Mesh Banner', pricePerSqFt: 6.0 },
  ],

  // Convenience map used by pricing calculations — mirrors materials[]
  materialPriceMap: {
    '13oz': 4.5,
    '15oz': 6.0,
    '18oz': 7.5,
    'mesh': 6.0,
  },

  minimumUnitPriceDollars: 20,
  minimumUnitPriceCents: 2000,

  grommets: [
    { value: 'none', label: 'None', description: 'No grommets' },
    { value: 'every-2-3ft', label: 'Every 2–3 Feet', description: 'Spaced along edges' },
    { value: 'every-1-2ft', label: 'Every 1–2 Feet', description: 'Closer spacing' },
    { value: '4-corners', label: '4 Corners Only', description: 'One grommet in each corner' },
    { value: 'top-corners', label: 'Top Corners Only', description: 'Top two corners' },
    { value: 'right-corners', label: 'Right Corners Only', description: 'Right two corners' },
    { value: 'left-corners', label: 'Left Corners Only', description: 'Left two corners' },
  ],

  rope: {
    available: true,
    pricePerFootCents: 200,       // $2.00/ft — from order-pricing.ts
    pricingMode: 'per_item',
  },

  polePockets: {
    available: true,
    setupFeeCents: 1500,          // $15.00 — from order-pricing.ts
    pricePerLinearFootCents: 200, // $2.00/ft — from order-pricing.ts
    pricingMode: 'per_item',
    positions: [
      { value: 'none', label: 'None' },
      { value: 'top', label: 'Top' },
      { value: 'bottom', label: 'Bottom' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'top-bottom', label: 'Top & Bottom' },
    ],
    sizes: ['1', '2', '3', '4'],
    defaultSize: '2',
  },

  quantityDiscountTiers: [
    { minQuantity: 1, discountRate: 0.00, label: '0% OFF' },
    { minQuantity: 2, discountRate: 0.05, label: '5% OFF' },
    { minQuantity: 3, discountRate: 0.07, label: '7% OFF' },
    { minQuantity: 4, discountRate: 0.10, label: '10% OFF' },
    { minQuantity: 5, discountRate: 0.13, label: '13% OFF' },
  ],

  taxRate: 0.06,

  print: {
    idealDpi: 300,
    minDpi: 100,
    maxTotalPixels: 50_000_000,
    format: 'jpeg',
    jpegQuality: 92,
  },

  editor: {
    defaultFitMode: 'fill',
    defaultImageScale: 1,
    defaultImagePosition: { x: 0, y: 0 },
    defaultCanvasBackgroundColor: '#FFFFFF',
    supportsTextElements: true,
    supportsOverlayImages: true,
    supportsDesignService: true,
  },

  // Banner uses per-sqft pricing (default)
  pricingModel: 'per_sqft',
  allowCustomDimensions: true,
};

// ============================================================================
// YARD SIGN PRODUCT CONFIGURATION
// Flat-rate pricing with predefined sizes and material multipliers
// ============================================================================

const yardSignProduct: ProductTypeConfig = {
  slug: 'yard_sign',
  name: 'Custom Yard Sign',
  description: 'Standard 24" × 18" corrugated plastic yard signs, printed fast and shipped next business day.',

  dimensions: {
    defaultWidthIn: 24,
    defaultHeightIn: 18,
    resetWidthIn: 24,
    resetHeightIn: 18,
    minIn: 18,
    maxIn: 24,
    maxSqFt: 3,   // 24" x 18" = 3 sq ft
    sizeLimitMessage: 'Standard yard sign size: 24" × 18"',
  },

  // Single material: Corrugated Plastic
  materials: [
    { key: 'corrugated', label: 'Corrugated Plastic', pricePerSqFt: 0 },
  ],

  materialPriceMap: {
    'corrugated': 0,
  },

  minimumUnitPriceDollars: 12,
  minimumUnitPriceCents: 1200,

  // Yard signs don't have grommets
  grommets: [],

  // No rope for yard signs
  rope: {
    available: false,
    pricePerFootCents: 0,
    pricingMode: 'per_item',
  },

  // No pole pockets for yard signs
  polePockets: {
    available: false,
    setupFeeCents: 0,
    pricePerLinearFootCents: 0,
    pricingMode: 'per_item',
    positions: [],
    sizes: [],
    defaultSize: '',
  },

  // No quantity discount tiers for yard signs — flat per-sign pricing
  quantityDiscountTiers: [
    { minQuantity: 1, discountRate: 0.00, label: '' },
  ],

  taxRate: 0.06,

  print: {
    idealDpi: 300,
    minDpi: 150,
    maxTotalPixels: 50_000_000,
    format: 'jpeg',
    jpegQuality: 92,
  },

  editor: {
    defaultFitMode: 'fill',
    defaultImageScale: 1,
    defaultImagePosition: { x: 0, y: 0 },
    defaultCanvasBackgroundColor: '#FFFFFF',
    supportsTextElements: false,
    supportsOverlayImages: false,
    supportsDesignService: true,
  },

  // --- Flat-rate pricing ---
  pricingModel: 'flat_rate',
  allowCustomDimensions: false,
  freeShippingMessage: 'FREE Next-Day Air Included',

  // Single standard size
  predefinedSizes: [
    { label: '24" × 18"', widthIn: 24, heightIn: 18, basePriceCents: 1200 },
  ],

  materialMultipliers: [
    { key: 'corrugated', label: 'Corrugated Plastic', multiplier: 1.0 },
  ],

  // --- Yard sign specific config ---
  // Single-Sided: $12/sign, Double-Sided: $14/sign
  // Step Stakes: $1.50 each
  // Max 90 signs per order for 24-hour production
};

// ============================================================================
// REGISTRY
// ============================================================================

const PRODUCT_REGISTRY: Record<ProductTypeSlug, ProductTypeConfig> = {
  banner: bannerProduct,
  yard_sign: yardSignProduct,
};

/**
 * Get product config by slug.
 * Returns the banner config as a safe default when slug is missing or unknown.
 */
export function getProductConfig(slug?: string | null): ProductTypeConfig {
  if (!slug || !(slug in PRODUCT_REGISTRY)) {
    return PRODUCT_REGISTRY.banner;
  }
  return PRODUCT_REGISTRY[slug as ProductTypeSlug];
}

/**
 * Check if a product type slug is valid.
 */
export function isValidProductType(slug: string): slug is ProductTypeSlug {
  return slug in PRODUCT_REGISTRY;
}

/**
 * Get all registered product types.
 */
export function getAllProductTypes(): ProductTypeConfig[] {
  return Object.values(PRODUCT_REGISTRY);
}

/**
 * Default product type slug.
 */
export const DEFAULT_PRODUCT_TYPE: ProductTypeSlug = 'banner';

/**
 * Get the material price map for a given product type.
 * This is a convenience function for backward compatibility with
 * existing code that uses PRICE_PER_SQFT directly.
 */
export function getMaterialPriceMap(slug?: string | null): Record<string, number> {
  return getProductConfig(slug).materialPriceMap;
}

/**
 * Get the minimum unit price in cents for a product type.
 */
export function getMinimumUnitPriceCents(slug?: string | null): number {
  return getProductConfig(slug).minimumUnitPriceCents;
}

/**
 * Get the tax rate for a product type.
 */
export function getTaxRate(slug?: string | null): number {
  return getProductConfig(slug).taxRate;
}

/**
 * Choose target DPI for print export based on product config and dimensions.
 * Replicates existing chooseTargetDpi logic from render-order-pdf.cjs.
 */
export function chooseTargetDpi(widthIn: number, heightIn: number, slug?: string | null): number {
  const config = getProductConfig(slug);
  const ideal = config.print.idealDpi;
  const maxPx = config.print.maxTotalPixels;
  if ((widthIn * ideal) * (heightIn * ideal) <= maxPx) return ideal;
  const scaled = Math.floor(Math.sqrt(maxPx / (widthIn * heightIn)));
  return Math.max(scaled, config.print.minDpi);
}
