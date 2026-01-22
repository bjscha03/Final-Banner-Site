/**
 * Quantity Discount Pricing Module
 * 
 * Implements tiered "Buy More, Save More" discount pricing.
 * This is the single source of truth for quantity-based discounts.
 * 
 * Default tiers:
 * - qty 1: 0%
 * - qty 2: 5%
 * - qty 3: 7%
 * - qty 4: 10%
 * - qty 5+: 13%
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QuantityDiscountTier {
  minQuantity: number;
  discountRate: number; // Decimal (e.g., 0.05 for 5%)
  label: string; // Display label (e.g., "5% OFF")
}

export interface QuantityDiscountResult {
  quantity: number;
  discountRate: number;
  discountCents: number;
  subtotalBeforeDiscountCents: number;
  subtotalAfterDiscountCents: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Quantity discount tiers
 * Can be easily updated to add more tiers or change rates
 */
export const QUANTITY_DISCOUNT_TIERS: QuantityDiscountTier[] = [
  { minQuantity: 1, discountRate: 0.00, label: '0% OFF' },
  { minQuantity: 2, discountRate: 0.05, label: '5% OFF' },
  { minQuantity: 3, discountRate: 0.07, label: '7% OFF' },
  { minQuantity: 4, discountRate: 0.10, label: '10% OFF' },
  { minQuantity: 5, discountRate: 0.13, label: '13% OFF' },
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get the discount rate for a given quantity
 * Uses the highest applicable tier
 * 
 * @param quantity - Number of items
 * @returns Discount rate as decimal (e.g., 0.05 for 5%)
 */
export function getQuantityDiscountRate(quantity: number): number {
  if (quantity < 1) return 0;
  
  // Find the highest tier that applies
  let applicableTier = QUANTITY_DISCOUNT_TIERS[0];
  
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (quantity >= tier.minQuantity) {
      applicableTier = tier;
    } else {
      break; // Tiers are sorted, so we can stop here
    }
  }
  
  return applicableTier.discountRate;
}

/**
 * Calculate quantity discount for a given subtotal and quantity
 * 
 * @param subtotalCents - Subtotal in cents before discount
 * @param quantity - Total quantity of items
 * @returns Discount calculation result
 */
export function calculateQuantityDiscount(
  subtotalCents: number,
  quantity: number
): QuantityDiscountResult {
  const discountRate = getQuantityDiscountRate(quantity);
  const discountCents = Math.round(subtotalCents * discountRate);
  const subtotalAfterDiscountCents = subtotalCents - discountCents;
  
  return {
    quantity,
    discountRate,
    discountCents,
    subtotalBeforeDiscountCents: subtotalCents,
    subtotalAfterDiscountCents,
  };
}

/**
 * Get the discount tier for a given quantity
 * Useful for displaying tier information in UI
 */
export function getQuantityDiscountTier(quantity: number): QuantityDiscountTier {
  if (quantity < 1) return QUANTITY_DISCOUNT_TIERS[0];
  
  let applicableTier = QUANTITY_DISCOUNT_TIERS[0];
  
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (quantity >= tier.minQuantity) {
      applicableTier = tier;
    } else {
      break;
    }
  }
  
  return applicableTier;
}

/**
 * Get all tiers for display in "Buy More, Save More" table
 */
export function getAllDiscountTiers(): QuantityDiscountTier[] {
  return [...QUANTITY_DISCOUNT_TIERS];
}

/**
 * Format discount rate as percentage string
 */
export function formatDiscountRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Format discount amount in cents as currency
 */
export function formatDiscountAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

