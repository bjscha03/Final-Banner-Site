/**
 * Central Discount Resolver - "Best Discount Wins"
 *
 * This is the SINGLE SOURCE OF TRUTH for discount resolution.
 * Discounts do NOT stack - only one discount is applied.
 *
 * Qualifying banner lines measuring at least 6' × 3' receive the automatic
 * Large Banner 25% Off promotion. The automatic promotion always wins over
 * quantity tiers and percentage codes of 25% or less. A genuinely larger
 * promotion may replace it, but the discounts are never added together.
 *
 * Used by: Quick Quote, Cart, Checkout, PayPal, Order Creation, Admin
 */

import { getQuantityDiscountRate } from './quantity-discount';
import {
  LARGE_BANNER_PROMOTION_ID,
  LARGE_BANNER_PROMOTION_LABEL,
  LARGE_BANNER_PROMOTION_PERCENTAGE,
  LARGE_BANNER_PROMOTION_RATE,
  calculateLargeBannerDiscountCents,
  isLargeBannerPromotionIdentifier,
  isQualifyingLargeBannerDimensions,
} from './largeBannerPromotion';

export {
  LARGE_BANNER_PROMOTION_ID,
  LARGE_BANNER_PROMOTION_LABEL,
  LARGE_BANNER_PROMOTION_PERCENTAGE,
  LARGE_BANNER_PROMOTION_RATE,
} from './largeBannerPromotion';

// ============================================================================
// TYPES
// ============================================================================

export type DiscountType = 'quantity' | 'promo' | 'none';
export type DiscountScope = 'order' | 'recovery_qualifying_banner_lines' | 'qualifying_large_banner_lines';

export const LARGE_BANNER_RECOVERY_CAMPAIGN = 'abandoned_cart_large_banner_25';
export const LARGE_BANNER_RECOVERY_SCOPE: DiscountScope = 'recovery_qualifying_banner_lines';
export const SEPTEMBER_LARGE_BANNER_CAMPAIGN = 'september_large_banner_2026';
export const SEPTEMBER_LARGE_BANNER_SCOPE: DiscountScope = 'qualifying_large_banner_lines';
export const AUTOMATIC_LARGE_BANNER_CAMPAIGN = LARGE_BANNER_PROMOTION_ID;
export const AUTOMATIC_LARGE_BANNER_SCOPE: DiscountScope = SEPTEMBER_LARGE_BANNER_SCOPE;

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
  /** Trusted promo base. Scoped promotions fail closed when omitted. */
  promoSubtotalCents?: number;
  /** Explicit qualifying subtotal for the automatic large-banner promotion. */
  automaticLargeBannerSubtotalCents?: number;
}

export interface ResolvedDiscount {
  appliedDiscountType: DiscountType;
  appliedDiscountLabel: string;
  appliedDiscountAmountCents: number;
  appliedDiscountRate: number; // Decimal (e.g., 0.13 for 13%)
  promotionId: string | null;

  // Metadata for UI
  quantityDiscountAvailable: boolean;
  quantityDiscountAmountCents: number;
  quantityDiscountRate: number;

  promoDiscountAvailable: boolean;
  promoDiscountAmountCents: number;
  promoDiscountCode: string | null;
  promoDiscountRate: number;

  automaticLargeBannerDiscountAvailable: boolean;
  automaticLargeBannerDiscountAmountCents: number;

  // Helper message
  helperMessage: string | null;
}

// `getPromoDiscountSubtotalCents` is called immediately before
// `resolveBestDiscount` by the storefront/cart paths. Preserve the separate
// automatic eligible subtotal alongside the same promo object without changing
// the existing public return type used by those callers.
const automaticLargeBannerSubtotalByPromo = new WeakMap<PromoDiscountInput, number>();

function normalizedCents(value: number | null | undefined): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

function manualPromoLabel(
  promoDiscount: PromoDiscountInput | null | undefined,
  amountCents: number,
): string {
  const code = String(promoDiscount?.code || 'Promo').trim().toUpperCase() || 'Promo';
  const percentage = Number(promoDiscount?.discountPercentage || 0);
  const valueLabel = percentage > 0
    ? `${percentage}% off`
    : `$${(amountCents / 100).toFixed(2)} off`;
  return `${code} (${valueLabel})`;
}

// ============================================================================
// CORE RESOLVER FUNCTIONS
// ============================================================================

export function isQualifyingLargeBannerDiscountItem(item: PromoDiscountCartItem): boolean {
  return isQualifyingLargeBannerDimensions(
    Number(item?.width_in),
    Number(item?.height_in),
    String(item?.product_type || ''),
  );
}

export function getAutomaticLargeBannerSubtotalCents(items: PromoDiscountCartItem[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    if (!isQualifyingLargeBannerDiscountItem(item)) return sum;
    const lineTotalCents = Number(item.line_total_cents);
    return Number.isSafeInteger(lineTotalCents) && lineTotalCents >= 0
      ? sum + lineTotalCents
      : sum;
  }, 0);
}

export function getPromoDiscountSubtotalCents(
  items: PromoDiscountCartItem[],
  subtotalCents: number,
  promoDiscount?: PromoDiscountInput | null,
): number {
  const automaticSubtotalCents = getAutomaticLargeBannerSubtotalCents(items);
  if (promoDiscount) {
    automaticLargeBannerSubtotalByPromo.set(promoDiscount, automaticSubtotalCents);
  }

  // With no typed promo, the returned subtotal carries the automatic eligible
  // base into resolveBestDiscount. No discount is synthesized from a code.
  if (!promoDiscount) return automaticSubtotalCents;

  if (promoDiscount.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE) {
    const code = String(promoDiscount.code || '').trim().toUpperCase();
    const validAutomaticPromotion = isLargeBannerPromotionIdentifier(code)
      && Number(promoDiscount.discountPercentage) === LARGE_BANNER_PROMOTION_PERCENTAGE
      && (
        code === LARGE_BANNER_PROMOTION_ID
        || promoDiscount.campaign === SEPTEMBER_LARGE_BANNER_CAMPAIGN
        || promoDiscount.campaign === AUTOMATIC_LARGE_BANNER_CAMPAIGN
      );
    if (!validAutomaticPromotion) return 0;
    return automaticSubtotalCents;
  }

  if (promoDiscount.discountScope !== LARGE_BANNER_RECOVERY_SCOPE) {
    return Math.max(0, Number(subtotalCents) || 0);
  }

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

/**
 * Resolves which discount to apply using "Best Discount Wins" logic.
 *
 * @param input - Subtotal, quantity, optional promo, and eligible subtotals
 * @returns The single best discount to apply
 */
export function resolveBestDiscount(input: DiscountResolverInput): ResolvedDiscount {
  const {
    subtotalCents,
    quantity,
    promoDiscount,
    quantitySubtotalCents,
    promoSubtotalCents,
    automaticLargeBannerSubtotalCents,
  } = input;

  const normalizedSubtotalCents = Math.max(0, normalizedCents(subtotalCents));
  const quantityBaseCents = quantitySubtotalCents == null
    ? normalizedSubtotalCents
    : normalizedCents(quantitySubtotalCents);

  const promoIsScoped = promoDiscount?.discountScope === LARGE_BANNER_RECOVERY_SCOPE
    || promoDiscount?.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE;
  const manualPromoBaseCents = promoSubtotalCents == null
    ? (promoIsScoped ? 0 : normalizedSubtotalCents)
    : normalizedCents(promoSubtotalCents);

  const automaticBaseCents = automaticLargeBannerSubtotalCents == null
    ? (
        promoDiscount
          ? (automaticLargeBannerSubtotalByPromo.get(promoDiscount) || 0)
          : normalizedCents(promoSubtotalCents)
      )
    : normalizedCents(automaticLargeBannerSubtotalCents);
  const automaticLargeBannerDiscountAmountCents = calculateLargeBannerDiscountCents(automaticBaseCents);
  const automaticLargeBannerDiscountAvailable = automaticLargeBannerDiscountAmountCents > 0;

  // Calculate quantity discount. It remains available as metadata, but it is
  // never stacked with or substituted for the automatic large-banner offer.
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);
  const quantityDiscountAvailable = quantityDiscountAmountCents > 0;

  // Calculate the typed/validated promo candidate.
  let manualPromoDiscountAmountCents = 0;
  let manualPromoDiscountRate = 0;
  const manualPromoCode = promoDiscount?.code
    ? String(promoDiscount.code).trim().toUpperCase()
    : null;

  if (promoDiscount) {
    const percentage = Number(promoDiscount.discountPercentage || 0);
    const fixedAmountCents = normalizedCents(promoDiscount.discountAmountCents);
    if (percentage > 0) {
      manualPromoDiscountRate = percentage / 100;
      manualPromoDiscountAmountCents = Math.round(manualPromoBaseCents * manualPromoDiscountRate);
    } else if (fixedAmountCents > 0) {
      manualPromoDiscountAmountCents = Math.min(fixedAmountCents, manualPromoBaseCents);
      manualPromoDiscountRate = manualPromoBaseCents > 0
        ? manualPromoDiscountAmountCents / manualPromoBaseCents
        : 0;
    }

    if (promoDiscount.discountScope === LARGE_BANNER_RECOVERY_SCOPE) {
      const cap = Number(promoDiscount.maxDiscountAmountCents);
      manualPromoDiscountAmountCents = Number.isSafeInteger(cap) && cap > 0
        ? Math.min(manualPromoDiscountAmountCents, cap)
        : 0;
    }
  }
  const manualPromoDiscountAvailable = manualPromoDiscountAmountCents > 0;

  if (automaticLargeBannerDiscountAvailable) {
    const manualPercentage = Number(promoDiscount?.discountPercentage || 0);
    const isAutomaticAlias = isLargeBannerPromotionIdentifier(manualPromoCode);
    const isFixedPromo = normalizedCents(promoDiscount?.discountAmountCents) > 0
      && manualPercentage <= 0;
    const manualPromoCanReplaceAutomatic = manualPromoDiscountAvailable
      && !isAutomaticAlias
      && manualPromoDiscountAmountCents > automaticLargeBannerDiscountAmountCents
      && (isFixedPromo || manualPercentage > LARGE_BANNER_PROMOTION_PERCENTAGE);

    if (manualPromoCanReplaceAutomatic) {
      return {
        appliedDiscountType: 'promo',
        appliedDiscountLabel: manualPromoLabel(promoDiscount, manualPromoDiscountAmountCents),
        appliedDiscountAmountCents: manualPromoDiscountAmountCents,
        appliedDiscountRate: manualPromoDiscountRate,
        promotionId: null,
        quantityDiscountAvailable,
        quantityDiscountAmountCents,
        quantityDiscountRate,
        promoDiscountAvailable: true,
        promoDiscountAmountCents: manualPromoDiscountAmountCents,
        promoDiscountCode: manualPromoCode,
        promoDiscountRate: manualPromoDiscountRate,
        automaticLargeBannerDiscountAvailable: true,
        automaticLargeBannerDiscountAmountCents,
        helperMessage: "Discounts can't be combined — we applied the larger promotion.",
      };
    }

    return {
      appliedDiscountType: 'promo',
      appliedDiscountLabel: LARGE_BANNER_PROMOTION_LABEL,
      appliedDiscountAmountCents: automaticLargeBannerDiscountAmountCents,
      appliedDiscountRate: LARGE_BANNER_PROMOTION_RATE,
      promotionId: LARGE_BANNER_PROMOTION_ID,
      quantityDiscountAvailable,
      quantityDiscountAmountCents,
      quantityDiscountRate,
      promoDiscountAvailable: true,
      promoDiscountAmountCents: automaticLargeBannerDiscountAmountCents,
      promoDiscountCode: LARGE_BANNER_PROMOTION_ID,
      promoDiscountRate: LARGE_BANNER_PROMOTION_RATE,
      automaticLargeBannerDiscountAvailable: true,
      automaticLargeBannerDiscountAmountCents,
      helperMessage: quantityDiscountAvailable || manualPromoDiscountAvailable
        ? 'Large-banner pricing is automatic and cannot be combined with other discounts.'
        : null,
    };
  }

  // No automatic large-banner promotion: retain the existing best-discount-
  // wins behavior between quantity and a typed/validated promo.
  let appliedDiscountType: DiscountType = 'none';
  let appliedDiscountLabel = '';
  let appliedDiscountAmountCents = 0;
  let appliedDiscountRate = 0;
  let helperMessage: string | null = null;

  if (quantityDiscountAvailable && manualPromoDiscountAvailable) {
    if (quantityDiscountAmountCents >= manualPromoDiscountAmountCents) {
      appliedDiscountType = 'quantity';
      appliedDiscountLabel = `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`;
      appliedDiscountAmountCents = quantityDiscountAmountCents;
      appliedDiscountRate = quantityDiscountRate;
    } else {
      appliedDiscountType = 'promo';
      appliedDiscountLabel = manualPromoLabel(promoDiscount, manualPromoDiscountAmountCents);
      appliedDiscountAmountCents = manualPromoDiscountAmountCents;
      appliedDiscountRate = manualPromoDiscountRate;
    }
    helperMessage = "Discounts can't be combined — we applied the best one.";
  } else if (quantityDiscountAvailable) {
    appliedDiscountType = 'quantity';
    appliedDiscountLabel = `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`;
    appliedDiscountAmountCents = quantityDiscountAmountCents;
    appliedDiscountRate = quantityDiscountRate;
  } else if (manualPromoDiscountAvailable) {
    appliedDiscountType = 'promo';
    appliedDiscountLabel = manualPromoLabel(promoDiscount, manualPromoDiscountAmountCents);
    appliedDiscountAmountCents = manualPromoDiscountAmountCents;
    appliedDiscountRate = manualPromoDiscountRate;
  }

  return {
    appliedDiscountType,
    appliedDiscountLabel,
    appliedDiscountAmountCents,
    appliedDiscountRate,
    promotionId: null,
    quantityDiscountAvailable,
    quantityDiscountAmountCents,
    quantityDiscountRate,
    promoDiscountAvailable: manualPromoDiscountAvailable,
    promoDiscountAmountCents: manualPromoDiscountAmountCents,
    promoDiscountCode: manualPromoCode,
    promoDiscountRate: manualPromoDiscountRate,
    automaticLargeBannerDiscountAvailable: false,
    automaticLargeBannerDiscountAmountCents: 0,
    helperMessage,
  };
}

/**
 * Calculate final totals with resolved discount.
 */
export function calculateTotalsWithBestDiscount(
  subtotalCents: number,
  quantity: number,
  taxRate: number,
  promoDiscount?: PromoDiscountInput | null,
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
