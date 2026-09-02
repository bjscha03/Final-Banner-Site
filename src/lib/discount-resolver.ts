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

export type DiscountType = 'quantity' | 'promo' | 'automatic' | 'none';
export type DiscountScope = 'order' | 'recovery_qualifying_banner_lines' | 'qualifying_large_banner_lines';

export const LARGE_BANNER_RECOVERY_CAMPAIGN = 'abandoned_cart_large_banner_25';
export const LARGE_BANNER_RECOVERY_SCOPE: DiscountScope = 'recovery_qualifying_banner_lines';
export const SEPTEMBER_LARGE_BANNER_CAMPAIGN = 'september_large_banner_2026';
export const SEPTEMBER_LARGE_BANNER_SCOPE: DiscountScope = 'qualifying_large_banner_lines';

// ============================================================================
// AUTOMATIC "LARGE BANNER 25% OFF" PROMOTION
// ============================================================================
//
// Permanent, automatic (no code required) 25% off every finished banner line
// where one side is >= 72" and the other side is >= 36", regardless of
// orientation. Never area-based; never applies to yard signs/car magnets.
// This is intentionally the SAME eligibility rule as the (now superseded)
// BIG25 seasonal promotion and the abandoned-cart recovery offer — those
// remain valid codes for backward compatibility, but on a qualifying line
// this automatic discount will win the "best discount wins" tie-break.
export const AUTOMATIC_LARGE_BANNER_ID = 'LARGE_BANNER_25';
export const AUTOMATIC_LARGE_BANNER_LABEL = 'Large Banner 25% Off';
export const AUTOMATIC_LARGE_BANNER_PERCENTAGE = 25;
export const AUTOMATIC_LARGE_BANNER_RATE = AUTOMATIC_LARGE_BANNER_PERCENTAGE / 100;
export const LARGE_BANNER_CONFLICT_MESSAGE =
  'This banner already includes our 25% large-banner discount. Additional percentage discounts cannot be combined.';
const BEST_DISCOUNT_CONFLICT_MESSAGE = "Discounts can't be combined — we applied the best one.";

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
  /**
   * Sum of line totals (cents) eligible for the automatic Large Banner 25%
   * Off promotion — see `getAutomaticLargeBannerSubtotalCents`. Opt-in: when
   * omitted (0), no automatic discount is considered, preserving legacy
   * callers that resolve discounts without item-level dimension data.
   */
  automaticDiscountBaseCents?: number;
}

export interface ResolvedDiscount {
  appliedDiscountType: DiscountType;
  appliedDiscountLabel: string;
  appliedDiscountAmountCents: number;
  appliedDiscountRate: number; // Decimal (e.g., 0.13 for 13%)
  /** Set to AUTOMATIC_LARGE_BANNER_ID when the automatic promotion is applied. */
  appliedPromotionId: string | null;

  // Metadata for UI
  quantityDiscountAvailable: boolean;
  quantityDiscountAmountCents: number;
  quantityDiscountRate: number;

  promoDiscountAvailable: boolean;
  promoDiscountAmountCents: number;
  promoDiscountCode: string | null;
  promoDiscountRate: number;

  automaticDiscountAvailable: boolean;
  automaticDiscountAmountCents: number;
  automaticDiscountRate: number;

  // Helper message
  helperMessage: string | null;
}

// ============================================================================
// CORE RESOLVER FUNCTION
// ============================================================================

/**
 * Centralized eligibility rule for the automatic Large Banner 25% Off
 * promotion (and its predecessor scoped promotions, which share the same
 * threshold). Orientation-independent and NOT area-based:
 *   (widthIn >= 72 && heightIn >= 36) || (widthIn >= 36 && heightIn >= 72)
 * Only applies to product_type 'banner' — never yard signs or car magnets.
 */
export function isLargeBannerEligible(
  widthIn: number,
  heightIn: number,
  productType: string | undefined | null,
): boolean {
  if (String(productType || '').trim().toLowerCase() !== 'banner') return false;
  return Number.isFinite(widthIn)
    && Number.isFinite(heightIn)
    && Math.max(widthIn, heightIn) >= 72
    && Math.min(widthIn, heightIn) >= 36;
}

export function isQualifyingLargeBannerDiscountItem(item: PromoDiscountCartItem): boolean {
  return isLargeBannerEligible(Number(item?.width_in), Number(item?.height_in), item?.product_type);
}

/**
 * Sum of line totals (cents) across every cart/order line that is
 * individually eligible for the automatic Large Banner 25% Off promotion.
 * This is the base the 25% automatic rate is applied to — NOT the full cart
 * subtotal — so a mixed cart only discounts its qualifying banner lines.
 */
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
  if (promoDiscount?.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE) {
    if (promoDiscount.code.trim().toUpperCase() !== 'BIG25'
        || promoDiscount.campaign !== SEPTEMBER_LARGE_BANNER_CAMPAIGN
        || Number(promoDiscount.discountPercentage) !== 25) {
      return 0;
    }
    return getAutomaticLargeBannerSubtotalCents(items);
  }
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

interface DiscountCandidate {
  type: DiscountType;
  rate: number;
  /**
   * Actual dollars-saved-per-dollar-spent for this candidate (amount / base),
   * used ONLY for tie-break comparison. This differs from `rate` when a
   * discount is capped (e.g. the scoped recovery offer's dollar cap), so a
   * nominally higher percentage that is capped down does not out-rank an
   * uncapped, lower-percentage discount that actually saves more per dollar.
   */
  effectiveRate: number;
  amount: number;
  label: string;
  promotionId: string | null;
}

/**
 * Resolves which discount to apply using "Best Discount Wins" logic.
 *
 * @param input - Subtotal, quantity, and optional promo discount
 * @returns The single best discount to apply
 */
export function resolveBestDiscount(input: DiscountResolverInput): ResolvedDiscount {
  const {
    subtotalCents,
    quantity,
    promoDiscount,
    quantitySubtotalCents,
    promoSubtotalCents,
    automaticDiscountBaseCents,
  } = input;

  // Quantity discount applies ONLY to banner items. The caller supplies a
  // banner-only subtotal via `quantitySubtotalCents`; if not provided we fall
  // back to the full subtotal for backward compatibility.
  const quantityBaseCents = quantitySubtotalCents ?? subtotalCents;
  const promoIsScoped = promoDiscount?.discountScope === LARGE_BANNER_RECOVERY_SCOPE
    || promoDiscount?.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE;
  const promoBaseCents = promoSubtotalCents ?? (promoIsScoped ? 0 : subtotalCents);

  // Calculate quantity discount
  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);
  const quantityDiscountAvailable = quantityDiscountAmountCents > 0;

  // Calculate the automatic Large Banner 25% Off discount. Opt-in via
  // `automaticDiscountBaseCents`; callers without item-level dimension data
  // simply omit it and get legacy (quantity vs. promo only) behavior.
  const automaticBaseCents = Math.max(0, automaticDiscountBaseCents || 0);
  const automaticDiscountAmountCents = Math.round(automaticBaseCents * AUTOMATIC_LARGE_BANNER_RATE);
  const automaticDiscountAvailable = automaticDiscountAmountCents > 0;

  // Calculate promo discount
  let promoDiscountAmountCents = 0;
  let promoDiscountRate = 0;
  const promoDiscountCode = promoDiscount?.code || null;
  const promoIsPercentage = Boolean(promoDiscount?.discountPercentage);

  if (promoDiscount) {
    if (promoDiscount.discountPercentage) {
      promoDiscountRate = promoDiscount.discountPercentage / 100;
      promoDiscountAmountCents = Math.round(promoBaseCents * promoDiscountRate);
    } else if (promoDiscount.discountAmountCents) {
      promoDiscountAmountCents = Math.min(promoDiscount.discountAmountCents, promoBaseCents);
      promoDiscountRate = promoBaseCents > 0 ? promoDiscountAmountCents / promoBaseCents : 0;
    }
    if (promoDiscount?.discountScope === LARGE_BANNER_RECOVERY_SCOPE) {
      const cap = Number(promoDiscount.maxDiscountAmountCents);
      promoDiscountAmountCents = Number.isSafeInteger(cap) && cap > 0
        ? Math.min(promoDiscountAmountCents, cap)
        : 0;
    }
  }
  const promoDiscountAvailable = promoDiscountAmountCents > 0;

  // "Best Discount Wins" — never stack. Among percentage-rate discounts
  // (automatic, quantity, percentage promo codes), the HIGHEST EFFECTIVE RATE
  // (actual dollars saved per dollar spent — see `effectiveRate`) wins; on
  // equal effective rates the larger dollar savings wins; on a further tie
  // the automatic promotion wins (listed first). A fixed-dollar promo code
  // can still beat the percentage winner outright if its savings are
  // greater, but it never stacks with it.
  const candidates: DiscountCandidate[] = [];
  if (automaticDiscountAvailable) {
    candidates.push({
      type: 'automatic',
      rate: AUTOMATIC_LARGE_BANNER_RATE,
      effectiveRate: automaticBaseCents > 0 ? automaticDiscountAmountCents / automaticBaseCents : 0,
      amount: automaticDiscountAmountCents,
      label: AUTOMATIC_LARGE_BANNER_LABEL,
      promotionId: AUTOMATIC_LARGE_BANNER_ID,
    });
  }
  if (quantityDiscountAvailable) {
    candidates.push({
      type: 'quantity',
      rate: quantityDiscountRate,
      effectiveRate: quantityBaseCents > 0 ? quantityDiscountAmountCents / quantityBaseCents : 0,
      amount: quantityDiscountAmountCents,
      label: `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`,
      promotionId: null,
    });
  }
  if (promoDiscountAvailable && promoIsPercentage) {
    candidates.push({
      type: 'promo',
      rate: promoDiscountRate,
      effectiveRate: promoBaseCents > 0 ? promoDiscountAmountCents / promoBaseCents : 0,
      amount: promoDiscountAmountCents,
      label: `${promoDiscountCode} (${promoDiscount?.discountPercentage}% off)`,
      promotionId: null,
    });
  }

  let winner: DiscountCandidate | null = null;
  for (const candidate of candidates) {
    if (!winner
        || candidate.effectiveRate > winner.effectiveRate
        || (candidate.effectiveRate === winner.effectiveRate && candidate.amount > winner.amount)) {
      winner = candidate;
    }
  }

  // A fixed-dollar promo code is not a percentage-rate candidate above; it
  // only wins by strictly greater dollar savings than the percentage winner.
  if (promoDiscountAvailable && !promoIsPercentage) {
    const fixedCandidate: DiscountCandidate = {
      type: 'promo',
      rate: promoDiscountRate,
      amount: promoDiscountAmountCents,
      label: `${promoDiscountCode} ($${(promoDiscountAmountCents / 100).toFixed(2)} off)`,
      promotionId: null,
    };
    if (!winner || fixedCandidate.amount > winner.amount) {
      winner = fixedCandidate;
    }
  }

  const appliedDiscountType: DiscountType = winner?.type ?? 'none';
  const appliedDiscountLabel = winner?.label ?? '';
  const appliedDiscountAmountCents = winner?.amount ?? 0;
  const appliedDiscountRate = winner?.rate ?? 0;
  const appliedPromotionId = winner?.promotionId ?? null;

  // Helper / conflict messaging. The specific large-banner conflict message
  // is reserved for the case where a customer actively entered a percentage
  // code that the automatic promotion pre-empted; any other multi-discount
  // collision (e.g. quantity vs. automatic with no code entered, or a fixed
  // dollar credit losing to a percentage) uses the generic message.
  let helperMessage: string | null = null;
  if (winner?.type === 'automatic' && promoDiscountCode && promoIsPercentage) {
    helperMessage = LARGE_BANNER_CONFLICT_MESSAGE;
  } else {
    const availableCount = [automaticDiscountAvailable, quantityDiscountAvailable, promoDiscountAvailable]
      .filter(Boolean).length;
    if (availableCount > 1) {
      helperMessage = BEST_DISCOUNT_CONFLICT_MESSAGE;
    }
  }

  return {
    appliedDiscountType,
    appliedDiscountLabel,
    appliedDiscountAmountCents,
    appliedDiscountRate,
    appliedPromotionId,
    quantityDiscountAvailable,
    quantityDiscountAmountCents,
    quantityDiscountRate,
    promoDiscountAvailable,
    promoDiscountAmountCents,
    promoDiscountCode,
    promoDiscountRate,
    automaticDiscountAvailable,
    automaticDiscountAmountCents,
    automaticDiscountRate: AUTOMATIC_LARGE_BANNER_RATE,
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
