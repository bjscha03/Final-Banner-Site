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

export type ProductTypeSlug = 'banner';

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
};

// ============================================================================
// REGISTRY
// ============================================================================

const PRODUCT_REGISTRY: Record<ProductTypeSlug, ProductTypeConfig> = {
  banner: bannerProduct,
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
