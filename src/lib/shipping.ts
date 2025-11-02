/**
 * Shipping cost calculation and validation
 */

export interface ShippingRate {
  country: string;
  countryName: string;
  baseCostCents: number; // Base shipping cost
  perPoundCents: number; // Cost per pound
  estimatedDays: string;
}

// Shipping rates for international orders
// US orders are always free next-day air
export const SHIPPING_RATES: Record<string, ShippingRate> = {
  'US': {
    country: 'US',
    countryName: 'United States',
    baseCostCents: 0,
    perPoundCents: 0,
    estimatedDays: '1 business day',
  },
  'CA': {
    country: 'CA',
    countryName: 'Canada',
    baseCostCents: 5000, // $50 base
    perPoundCents: 1000, // $10 per lb
    estimatedDays: '5-7 business days',
  },
  'MX': {
    country: 'MX',
    countryName: 'Mexico',
    baseCostCents: 6000, // $60 base
    perPoundCents: 1200, // $12 per lb
    estimatedDays: '7-10 business days',
  },
  'GB': {
    country: 'GB',
    countryName: 'United Kingdom',
    baseCostCents: 10000, // $100 base
    perPoundCents: 2000, // $20 per lb
    estimatedDays: '7-14 business days',
  },
  'AU': {
    country: 'AU',
    countryName: 'Australia',
    baseCostCents: 15000, // $150 base
    perPoundCents: 3000, // $30 per lb
    estimatedDays: '10-21 business days',
  },
  // Default for all other countries
  'INTERNATIONAL': {
    country: 'INTERNATIONAL',
    countryName: 'International',
    baseCostCents: 15000, // $150 base
    perPoundCents: 3000, // $30 per lb
    estimatedDays: '10-21 business days',
  },
};

/**
 * Estimate weight of banner order in pounds
 * Based on material and square footage
 */
export function estimateBannerWeight(
  widthIn: number,
  heightIn: number,
  quantity: number,
  material: string
): number {
  const sqft = (widthIn * heightIn * quantity) / 144;
  
  // Weight per square foot by material (in pounds)
  const weightPerSqft: Record<string, number> = {
    '13oz': 0.9,  // 13oz vinyl is ~0.9 lbs/sqft
    '18oz': 1.25, // 18oz vinyl is ~1.25 lbs/sqft
    'mesh': 0.7,  // Mesh is lighter
    'fabric': 0.5, // Fabric is lightest
  };
  
  const materialWeight = weightPerSqft[material] || 1.0; // Default to 1 lb/sqft
  const bannerWeight = sqft * materialWeight;
  
  // Add packaging weight (2 lbs minimum)
  const packagingWeight = 2;
  
  return Math.max(bannerWeight + packagingWeight, 2);
}

/**
 * Calculate shipping cost for an order
 */
export function calculateShippingCost(
  country: string,
  totalWeightLbs: number
): {
  shippingCostCents: number;
  rate: ShippingRate;
  weightLbs: number;
} {
  // US orders are always free
  if (country === 'US' || country === 'USA') {
    return {
      shippingCostCents: 0,
      rate: SHIPPING_RATES['US'],
      weightLbs: totalWeightLbs,
    };
  }
  
  // Get rate for country or use international default
  const rate = SHIPPING_RATES[country] || SHIPPING_RATES['INTERNATIONAL'];
  
  // Calculate cost: base + (weight * per pound rate)
  const shippingCostCents = rate.baseCostCents + Math.ceil(totalWeightLbs * rate.perPoundCents);
  
  return {
    shippingCostCents,
    rate,
    weightLbs: totalWeightLbs,
  };
}

/**
 * Format shipping cost for display
 */
export function formatShippingCost(cents: number): string {
  if (cents === 0) {
    return 'FREE';
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Get shipping message for country
 */
export function getShippingMessage(country: string): string {
  if (country === 'US' || country === 'USA') {
    return 'FREE Next-Day Air Shipping';
  }
  
  const rate = SHIPPING_RATES[country] || SHIPPING_RATES['INTERNATIONAL'];
  return `International Shipping: ${rate.estimatedDays}`;
}
