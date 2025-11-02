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

// Tiered flat-rate shipping for international orders
// US orders are always free next-day air
// Tiers protect against large orders (e.g., 100 banners would be very heavy)

export interface ShippingTier {
  maxWeightLbs: number; // Maximum weight for this tier (0 = unlimited)
  costCents: number;    // Flat cost for this tier
}

export interface ShippingRateTable {
  country: string;
  countryName: string;
  tiers: ShippingTier[];
  estimatedDays: string;
}

export const SHIPPING_RATES: Record<string, ShippingRateTable> = {
  'US': {
    country: 'US',
    countryName: 'United States',
    tiers: [
      { maxWeightLbs: 0, costCents: 0 } // Always free
    ],
    estimatedDays: '1 business day',
  },
  'CA': {
    country: 'CA',
    countryName: 'Canada',
    tiers: [
      { maxWeightLbs: 10, costCents: 5000 },   // Up to 10 lbs: $50
      { maxWeightLbs: 25, costCents: 10000 },  // 10-25 lbs: $100
      { maxWeightLbs: 50, costCents: 18000 },  // 25-50 lbs: $180
      { maxWeightLbs: 0, costCents: 35000 }    // 50+ lbs: $350
    ],
    estimatedDays: '5-7 business days',
  },
  'MX': {
    country: 'MX',
    countryName: 'Mexico',
    tiers: [
      { maxWeightLbs: 10, costCents: 6000 },   // Up to 10 lbs: $60
      { maxWeightLbs: 25, costCents: 12000 },  // 10-25 lbs: $120
      { maxWeightLbs: 50, costCents: 22000 },  // 25-50 lbs: $220
      { maxWeightLbs: 0, costCents: 40000 }    // 50+ lbs: $400
    ],
    estimatedDays: '7-10 business days',
  },
  'GB': {
    country: 'GB',
    countryName: 'United Kingdom',
    tiers: [
      { maxWeightLbs: 10, costCents: 10000 },  // Up to 10 lbs: $100
      { maxWeightLbs: 25, costCents: 20000 },  // 10-25 lbs: $200
      { maxWeightLbs: 50, costCents: 35000 },  // 25-50 lbs: $350
      { maxWeightLbs: 0, costCents: 60000 }    // 50+ lbs: $600
    ],
    estimatedDays: '7-14 business days',
  },
  'AU': {
    country: 'AU',
    countryName: 'Australia',
    tiers: [
      { maxWeightLbs: 10, costCents: 15000 },  // Up to 10 lbs: $150
      { maxWeightLbs: 25, costCents: 30000 },  // 10-25 lbs: $300
      { maxWeightLbs: 50, costCents: 50000 },  // 25-50 lbs: $500
      { maxWeightLbs: 0, costCents: 80000 }    // 50+ lbs: $800
    ],
    estimatedDays: '10-21 business days',
  },
  // Default for all other countries (Europe, Asia, etc.)
  'INTERNATIONAL': {
    country: 'INTERNATIONAL',
    countryName: 'International',
    tiers: [
      { maxWeightLbs: 10, costCents: 15000 },  // Up to 10 lbs: $150
      { maxWeightLbs: 25, costCents: 30000 },  // 10-25 lbs: $300
      { maxWeightLbs: 50, costCents: 50000 },  // 25-50 lbs: $500
      { maxWeightLbs: 0, costCents: 80000 }    // 50+ lbs: $800
    ],
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
 * Calculate shipping cost for an order using tiered flat rates
 */
export function calculateShippingCost(
  country: string,
  totalWeightLbs: number
): {
  shippingCostCents: number;
  rateTable: ShippingRateTable;
  weightLbs: number;
  tier: ShippingTier;
} {
  // US orders are always free
  if (country === 'US' || country === 'USA') {
    const usRate = SHIPPING_RATES['US'];
    return {
      shippingCostCents: 0,
      rateTable: usRate,
      weightLbs: totalWeightLbs,
      tier: usRate.tiers[0],
    };
  }
  
  // Get rate table for country or use international default
  const rateTable = SHIPPING_RATES[country] || SHIPPING_RATES['INTERNATIONAL'];
  
  // Find the appropriate tier based on weight
  let selectedTier = rateTable.tiers[rateTable.tiers.length - 1]; // Default to highest tier
  
  for (const tier of rateTable.tiers) {
    if (tier.maxWeightLbs === 0 || totalWeightLbs <= tier.maxWeightLbs) {
      selectedTier = tier;
      break;
    }
  }
  
  return {
    shippingCostCents: selectedTier.costCents,
    rateTable,
    weightLbs: totalWeightLbs,
    tier: selectedTier,
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
  
  const rateTable = SHIPPING_RATES[country] || SHIPPING_RATES['INTERNATIONAL'];
  return `International Shipping: ${rateTable.estimatedDays}`;
}
