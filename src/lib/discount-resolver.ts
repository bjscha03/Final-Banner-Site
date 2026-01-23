/**
 * Central Discount Resolver - "Best Discount Wins"
 * 
 * This is the SINGLE SOURCE OF TRUTH for discount resolution.
 * Discounts do NOT stack - only the best one is applied.
 * 
 * Used by: Quick Quote, Cart, Checkout, PayPal, Order Creation, Admin
 */

import { getQuantityDiscountRate } from './quantity-discount';

// ============================================================================
// TYPES
// ============================================================================

export type DiscountType = 'quantity' | 'promo' | 'none';

export interface PromoDiscountInput {
  code: string;
  discountPercentage?: number;  // e.g., 20 for 20%
  discountAmountCents?: number; // Fixed amount in cents
}

export interface DiscountResolverInput {
  subtotalCents: number;
  quantity: number;
  promoDiscount?: PromoDiscountInput | null;
}

export interface ResolvedDiscount {
  appliedDiscountType: DiscountType;
  appliedDiscountLabel: string;
  appliedDiscountAmountCents: number;
  appliedDiscountRate: number; // Decimal (e.g., 0.13 for 13%)
  
  // Metadata for UI
  quantityDiscountAvailable: boolean;
  quantityDiscountAmountCents: number;
  quantityDiscountRate: number;
  
  promoDiscountAvailable: boolean;
  promoDiscountAmountCents: number;
  promoDiscountCode: string | null;
  promoDiscountRate: number;
  
  // Helper message
  helperMessage: string | null;
}

// ============================================================================
// CORE RESOLVER FUNCTION
// ============================================================================

/**
 * Resolves which discount to apply using "Best Discount Wins" logic.
 * 
 * @param input - Subtotal, quantity, and optional promo discount
 * @returns The single best discount to apply
 */
export function resolveBestDiscount(input: DiscountResolverInput): ResolvedDiscount {
  const { subtotalCents, quantity, promoDiscount } = input;
  
  // Calculate quantity discount
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(subtotalCents * quantityDiscountRate);
  const quantityDiscountAvailable = quantityDiscountAmountCents > 0;
  
  // Calculate promo discount
  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  const promoDiscountCode = promoDiscount?.code || null;
  
  if (promoDiscount) {
    if (promoDiscount.discountPercentage) {
      promoDiscountRate = promoDiscount.discountPercentage / 100;
      promoDiscountAmountCents = Math.round(subtotalCents * promoDiscountRate);
    } else if (promoDiscount.discountAmountCents) {
      promoDiscountAmountCents = Math.min(promoDiscount.discountAmountCents, subtotalCents);
      promoDiscountRate = subtotalCents > 0 ? promoDiscountAmountCents / subtotalCents : 0;
    }
  }
  const promoDiscountAvailable = promoDiscountAmountCents > 0;
  
  // Determine which discount is better (higher amount wins)
  let appliedDiscountType: DiscountType = 'none';
  let appliedDiscountLabel = '';
  let appliedDiscountAmountCents = 0;
  let appliedDiscountRate = 0;
  let helperMessage: string | null = null;
  
  if (quantityDiscountAvailable && promoDiscountAvailable) {
    // Both available - pick the better one
    if (quantityDiscountAmountCents >= promoDiscountAmountCents) {
      appliedDiscountType = 'quantity';
      appliedDiscountLabel = `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`;
      appliedDiscountAmountCents = quantityDiscountAmountCents;
      appliedDiscountRate = quantityDiscountRate;
    } else {
      appliedDiscountType = 'promo';
      const percentLabel = promoDiscount?.discountPercentage 
        ? `${promoDiscount.discountPercentage}% off`
        : `$${(promoDiscountAmountCents / 100).toFixed(2)} off`;
      appliedDiscountLabel = `${promoDiscountCode} (${percentLabel})`;
      appliedDiscountAmountCents = promoDiscountAmountCents;
      appliedDiscountRate = promoDiscountRate;
    }
    helperMessage = "Discounts can't be combined — we applied the best one.";
  } else if (quantityDiscountAvailable) {
    appliedDiscountType = 'quantity';
    appliedDiscountLabel = `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`;
    appliedDiscountAmountCents = quantityDiscountAmountCents;
    appliedDiscountRate = quantityDiscountRate;
  } else if (promoDiscountAvailable) {
    appliedDiscountType = 'promo';
    const percentLabel = promoDiscount?.discountPercentage 
      ? `${promoDiscount.discountPercentage}% off`
      : `$${(promoDiscountAmountCents / 100).toFixed(2)} off`;
    appliedDiscountLabel = `${promoDiscountCode} (${percentLabel})`;
    appliedDiscountAmountCents = promoDiscountAmountCents;
    appliedDiscountRate = promoDiscountRate;
  }
  
  return {
    appliedDiscountType,
    appliedDiscountLabel,
    appliedDiscountAmountCents,
    appliedDiscountRate,
    quantityDiscountAvailable,
    quantityDiscountAmountCents,
    quantityDiscountRate,
    promoDiscountAvailable,
    promoDiscountAmountCents,
    promoDiscountCode,
    promoDiscountRate,
    helperMessage,
  };
}

/**
 * Calculate final totals with resolved discount
 */
export function calculateTotalsWithBestDiscount(
  subtotalCents: number,
  quantity: number,
  taxRate: number,
  promoDiscount?: PromoDiscountInput | null
): {
  subtotalCents: number;
  discount: ResolvedDiscount;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
} {
  const discount = resolveBestDiscount({ subtotalCents, quantity, promoDiscount });
  const subtotalAfterDiscountCents = subtotalCents - discount.appliedDiscountAmountCents;
  const taxCents = Math.round(subtotalAfterDiscountCents * taxRate);
  const shippingCents = 0; // Free shipping
  const totalCents = subtotalAfterDiscountCents + taxCents + shippingCents;
  
  return {
    subtotalCents,
    discount,
    subtotalAfterDiscountCents,
    taxCents,
    shippingCents,
    totalCents,
  };
}

