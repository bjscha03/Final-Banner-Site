import { MaterialKey } from '@/store/quote';

export const PRICE_PER_SQFT = {
  '13oz': 4.5,
  '15oz': 6.0,
  '18oz': 7.5,
  'mesh': 6.0
} as const;

export const TAX_RATE = 0.06; // 6% tax rate

export const inchesToSqFt = (widthIn: number, heightIn: number): number => {
  return (widthIn * heightIn) / 144;
};

export const ropeCost = (widthIn: number, quantity: number): number => {
  return (widthIn / 12) * 2 * quantity;
};

export const polePocketCost = (widthIn: number, heightIn: number, polePockets: string, quantity: number): number => {
  if (polePockets === 'none') return 0;

  const setupFee = 15.00;
  const pricePerLinearFoot = 2.00;

  let linearFeet = 0;

  switch (polePockets) {
    case 'top':
    case 'bottom':
      linearFeet = widthIn / 12;
      break;
    case 'left':
    case 'right':
      linearFeet = heightIn / 12;
      break;
    case 'top-bottom':
      linearFeet = (widthIn / 12) * 2;
      break;
    default:
      linearFeet = 0;
  }

  return setupFee + (linearFeet * pricePerLinearFoot * quantity);
};

export interface CalcTotalsParams {
  widthIn: number;
  heightIn: number;
  qty: number;
  material: MaterialKey;
  addRope: boolean;
  polePockets?: string;
}

export interface CalcTotalsResult {
  area: number;
  unit: number;
  rope: number;
  polePocket: number;
  materialTotal: number;
  tax: number;
  totalWithTax: number;
}

export function calcTotals({
  widthIn,
  heightIn,
  qty,
  material,
  addRope,
  polePockets = 'none'
}: CalcTotalsParams): CalcTotalsResult {
  const area = inchesToSqFt(widthIn, heightIn);
  const unit = area * PRICE_PER_SQFT[material];
  const rope = addRope ? ropeCost(widthIn, qty) : 0;
  const polePocket = polePocketCost(widthIn, heightIn, polePockets, qty);
  const materialTotal = unit * qty + rope + polePocket;
  const tax = materialTotal * TAX_RATE;
  const totalWithTax = materialTotal + tax;

  return {
    area,
    unit,
    rope,
    polePocket,
    materialTotal,
    tax,
    totalWithTax
  };
}

export const calculateTax = (subtotal: number): number => {
  return subtotal * TAX_RATE;
};

export const calculateTotalWithTax = (subtotal: number): number => {
  return subtotal + calculateTax(subtotal);
};

export const usd = (amount: number): string => {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });
};

export const formatArea = (area: number): string => {
  return `${area.toFixed(2)} sq ft`;
};

export const formatDimensions = (widthIn: number, heightIn: number): string => {
  return `${widthIn}" × ${heightIn}"`;
};

// Feature flag support for new pricing logic
// Environment variables:
// FEATURE_FREE_SHIPPING=1 (enables free shipping on all orders)
// FEATURE_MIN_ORDER_FLOOR=0 (disabled - no minimum order required)
// MIN_ORDER_CENTS=0 (no minimum order amount)
// SHIPPING_METHOD_LABEL=Free Next-Day Air
// SITE_BADGE=FREE Next-Day Air • 24-Hour Production

export interface PricingItem {
  line_total_cents: number;
}

export interface PricingOptions {
  freeShipping: boolean;
  minFloorCents: number;
  shippingMethodLabel?: string;
}

export interface PricingTotals {
  raw_subtotal_cents: number;
  adjusted_subtotal_cents: number;
  min_order_adjustment_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
}

/**
 * Compute order totals with feature flag support
 */
export function computeTotals(
  items: PricingItem[],
  taxRate: number,
  opts: PricingOptions
): PricingTotals {
  const raw = items.reduce((sum, i) => sum + i.line_total_cents, 0);
  const adjusted = Math.max(raw, opts.minFloorCents || 0);
  const minAdj = Math.max(0, adjusted - raw);

  const shipping_cents = opts.freeShipping ? 0 : 0;
  const tax_cents = Math.round(adjusted * taxRate);
  const total_cents = adjusted + tax_cents + shipping_cents;

  return {
    raw_subtotal_cents: raw,
    adjusted_subtotal_cents: adjusted,
    min_order_adjustment_cents: minAdj,
    shipping_cents,
    tax_cents,
    total_cents,
  };
}

/**
 * Get feature flag values from environment variables
 */
export function getFeatureFlags() {
  const getEnvVar = (key: string) => {
    return import.meta.env?.[`VITE_${key}`] ||
           (typeof process !== 'undefined' && process.env?.[key]) ||
           (typeof window !== 'undefined' && (window as any).ENV?.[key]);
  };

  return {
    freeShipping: getEnvVar('FEATURE_FREE_SHIPPING') === '1',
    minOrderFloor: getEnvVar('FEATURE_MIN_ORDER_FLOOR') === '1',
    minOrderCents: parseInt(getEnvVar('MIN_ORDER_CENTS') || '2000', 10),
    shippingMethodLabel: getEnvVar('SHIPPING_METHOD_LABEL') || 'Free Next-Day Air',
    siteBadge: getEnvVar('SITE_BADGE') || 'FREE Next-Day Air • 24-Hour Production',
    // PayPal feature flags
    paypalEnabled: getEnvVar('FEATURE_PAYPAL') === '1'
  };
}

/**
 * Check if current user is admin (client-side helper)
 */
export function isCurrentUserAdmin(userEmail?: string): boolean {
  if (!userEmail) return false;

  // This will be populated by the server via a separate endpoint
  // For now, return false as admin status should be checked server-side
  return false;
}

/**
 * Get pricing options based on current feature flags
 */
export function getPricingOptions(): PricingOptions {
  const flags = getFeatureFlags();

  return {
    freeShipping: flags.freeShipping,
    minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
    shippingMethodLabel: flags.shippingMethodLabel
  };
}

/**
 * Log pricing calculation for debugging
 */
export function logPricingCalculation(totals: PricingTotals, orderId?: string) {
  console.info('pricing', {
    orderId,
    raw_subtotal_cents: totals.raw_subtotal_cents,
    adjusted_subtotal_cents: totals.adjusted_subtotal_cents,
    min_order_adjustment_cents: totals.min_order_adjustment_cents,
    shipping_cents: totals.shipping_cents,
    tax_cents: totals.tax_cents,
    total_cents: totals.total_cents,
    timestamp: new Date().toISOString()
  });
}
