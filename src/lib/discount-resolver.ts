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
export type DiscountScope = 'order' | 'recovery_qualifying_banner_lines';

export const LARGE_BANNER_RECOVERY_CAMPAIGN = 'abandoned_cart_large_banner_25';
export const LARGE_BANNER_RECOVERY_SCOPE: DiscountScope = 'recovery_qualifying_banner_lines';

export interface PromoDiscountInput {
  code: string;
  discountPercentage?: number;  // e.g., 20 for 20%
  discountAmountCents?: number; // Fixed amount in cents
  campaign?: string | null;
  discountScope?: DiscountScope;
  eligibleCartItemIds?: string[];
  maxDiscountAmountCents?: number | null;
}

export interface PromoDiscountCartItem {
  id: string;
  product_type?: string;
  width_in: number;
  height_in: number;
  line_total_cents: number;
}

export interface DiscountResolverInput {
  subtotalCents: number;
  quantity: number;
  promoDiscount?: PromoDiscountInput | null;
  /**
   * Optional banner-only subtotal used as the base for the quantity discount
   * calculation. Per business rule, ONLY banner items participate in the
   * quantity discount tiers; yard signs and car magnets do not. When provided,
   * the quantity discount is computed against this value while the promo
   * discount continues to apply to the full `subtotalCents`. Defaults to
   * `subtotalCents` for backward compatibility.
   */
  quantitySubtotalCents?: number;
  /** Trusted promo base. Scoped recovery discounts fail closed when omitted. */
  promoSubtotalCents?: number;
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
export function isQualifyingLargeBannerDiscountItem(item: PromoDiscountCartItem): boolean {
  if (String(item?.product_type || '').trim().toLowerCase() !== 'banner') return false;
  const width = Number(item?.width_in);
  const height = Number(item?.height_in);
  return Number.isFinite(width)
    && Number.isFinite(height)
    && Math.max(width, height) >= 72
    && Math.min(width, height) >= 36;
}

export function getPromoDiscountSubtotalCents(
  items: PromoDiscountCartItem[],
  subtotalCents: number,
  promoDiscount?: PromoDiscountInput | null,
): number {
  if (promoDiscount?.discountScope !== LARGE_BANNER_RECOVERY_SCOPE) return subtotalCents;
  if (promoDiscount.campaign !== LARGE_BANNER_RECOVERY_CAMPAIGN
      || !Array.isArray(promoDiscount.eligibleCartItemIds)
      || !Number.isInteger(promoDiscount.maxDiscountAmountCents)
      || Number(promoDiscount.maxDiscountAmountCents) <= 0) {
    return 0;
  }
  const eligibleIds = new Set(promoDiscount.eligibleCartItemIds.filter((id) => (
    typeof id === 'string' && id.trim().length > 0
  )));
  if (!eligibleIds.size) return 0;
  return items.reduce((sum, item) => {
    if (!eligibleIds.has(item.id) || !isQualifyingLargeBannerDiscountItem(item)) return sum;
    const lineTotalCents = Number(item.line_total_cents);
    return Number.isSafeInteger(lineTotalCents) && lineTotalCents >= 0
      ? sum + lineTotalCents
      : sum;
  }, 0);
}

export function resolveBestDiscount(input: DiscountResolverInput): ResolvedDiscount {
  const { subtotalCents, quantity, promoDiscount, quantitySubtotalCents, promoSubtotalCents } = input;

  // Quantity discount applies ONLY to banner items. The caller supplies a
  // banner-only subtotal via `quantitySubtotalCents`; if not provided we fall
  // back to the full subtotal for backward compatibility.
  const quantityBaseCents = quantitySubtotalCents ?? subtotalCents;
  const promoIsScoped = promoDiscount?.discountScope === LARGE_BANNER_RECOVERY_SCOPE;
  const promoBaseCents = promoSubtotalCents ?? (promoIsScoped ? 0 : subtotalCents);

  // Calculate quantity discount
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);
  const quantityDiscountAvailable = quantityDiscountAmountCents > 0;
  
  // Calculate promo discount
  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  const promoDiscountCode = promoDiscount?.code || null;
  
  if (promoDiscount) {
    if (promoDiscount.discountPercentage) {
      promoDiscountRate = promoDiscount.discountPercentage / 100;
      promoDiscountAmountCents = Math.round(promoBaseCents * promoDiscountRate);
    } else if (promoDiscount.discountAmountCents) {
      promoDiscountAmountCents = Math.min(promoDiscount.discountAmountCents, promoBaseCents);
      promoDiscountRate = promoBaseCents > 0 ? promoDiscountAmountCents / promoBaseCents : 0;
    }
    if (promoIsScoped) {
      const cap = Number(promoDiscount.maxDiscountAmountCents);
      promoDiscountAmountCents = Number.isSafeInteger(cap) && cap > 0
        ? Math.min(promoDiscountAmountCents, cap)
        : 0;
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
