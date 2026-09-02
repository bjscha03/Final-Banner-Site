/**
 * Central Discount Resolver - "Best Discount Wins"
 *
 * This is the SINGLE SOURCE OF TRUTH for client-side discount resolution.
 * Discounts never compound: quantity savings, the automatic large-banner
 * promotion, and a manually-entered promotion are evaluated independently and
 * only the single largest eligible discount is applied.
 *
 * Used by: configurators, cart, checkout, order summaries and tests.
 */

import { getQuantityDiscountRate } from './quantity-discount';

// ============================================================================
// PROMOTION CONSTANTS
// ============================================================================

export const LARGE_BANNER_PROMO_ID = 'LARGE_BANNER_25';
export const LARGE_BANNER_PROMO_LABEL = 'Large Banner 25% Off';
export const LARGE_BANNER_PROMO_PERCENTAGE = 25;
export const LARGE_BANNER_PROMO_RATE = LARGE_BANNER_PROMO_PERCENTAGE / 100;
export const LARGE_BANNER_LONG_SIDE_INCHES = 72;
export const LARGE_BANNER_SHORT_SIDE_INCHES = 36;
export const LARGE_BANNER_PERCENT_DISCOUNT_CONFLICT_MESSAGE =
  'This banner already includes our 25% large-banner discount. Additional percentage discounts cannot be combined.';

export const LARGE_BANNER_RECOVERY_CAMPAIGN = 'abandoned_cart_large_banner_25';
export const LARGE_BANNER_RECOVERY_SCOPE: DiscountScope = 'recovery_qualifying_banner_lines';
export const SEPTEMBER_LARGE_BANNER_CAMPAIGN = 'september_large_banner_2026';
export const SEPTEMBER_LARGE_BANNER_SCOPE: DiscountScope = 'qualifying_large_banner_lines';

// ============================================================================
// TYPES
// ============================================================================

export type DiscountType = 'quantity' | 'promo' | 'none';
export type AppliedPromotionSource = 'automatic' | 'promo_code' | 'quantity' | 'none';
export type DiscountScope = 'order' | 'recovery_qualifying_banner_lines' | 'qualifying_large_banner_lines';

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
   * Optional banner-only subtotal used as the base for the quantity discount.
   * Yard signs and car magnets do not participate in banner quantity tiers.
   */
  quantitySubtotalCents?: number;
  /**
   * Subtotal eligible for a manually-entered promotion. For compatibility with
   * the Zustand cart, when no manual promotion is present this may instead be
   * the qualifying large-banner subtotal returned by
   * getPromoDiscountSubtotalCents().
   */
  promoSubtotalCents?: number;
  /** Preferred explicit base for the automatic LARGE_BANNER_25 promotion. */
  automaticPromotionSubtotalCents?: number;
}

export interface ResolvedDiscount {
  appliedDiscountType: DiscountType;
  appliedDiscountLabel: string;
  appliedDiscountAmountCents: number;
  appliedDiscountRate: number; // Decimal (e.g., 0.25 for 25%)
  appliedPromotionSource: AppliedPromotionSource;
  appliedPromotionId: string | null;

  // Quantity candidate metadata
  quantityDiscountAvailable: boolean;
  quantityDiscountAmountCents: number;
  quantityDiscountRate: number;

  // Winning promotional candidate metadata. Automatic promotion intentionally
  // uses these legacy fields so existing configurators render it immediately.
  promoDiscountAvailable: boolean;
  promoDiscountAmountCents: number;
  promoDiscountCode: string | null;
  promoDiscountRate: number;

  // Manual promo metadata for audit/debugging.
  manualPromoDiscountAvailable: boolean;
  manualPromoDiscountAmountCents: number;
  manualPromoDiscountCode: string | null;
  manualPromoDiscountRate: number;

  // Automatic promotion metadata.
  automaticPromotionEligible: boolean;
  automaticPromotionId: typeof LARGE_BANNER_PROMO_ID;
  automaticPromotionLabel: typeof LARGE_BANNER_PROMO_LABEL;
  automaticPromotionAmountCents: number;
  automaticPromotionRate: typeof LARGE_BANNER_PROMO_RATE;

  helperMessage: string | null;
}

interface DiscountCandidate {
  source: Exclude<AppliedPromotionSource, 'none'>;
  type: Exclude<DiscountType, 'none'>;
  id: string;
  label: string;
  amountCents: number;
  rate: number;
  priority: number;
}

// ============================================================================
// LARGE-BANNER ELIGIBILITY
// ============================================================================

/**
 * Exact automatic-promotion rule. It is deliberately dimension-based rather
 * than square-footage-based and works in either orientation.
 */
export function isLargeBannerPromoEligible(widthIn: number, heightIn: number): boolean {
  const width = Number(widthIn);
  const height = Number(heightIn);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return (
    (width >= LARGE_BANNER_LONG_SIDE_INCHES && height >= LARGE_BANNER_SHORT_SIDE_INCHES)
    || (width >= LARGE_BANNER_SHORT_SIDE_INCHES && height >= LARGE_BANNER_LONG_SIDE_INCHES)
  );
}

export function isQualifyingLargeBannerDiscountItem(item: PromoDiscountCartItem): boolean {
  if (String(item?.product_type || '').trim().toLowerCase() !== 'banner') return false;
  return isLargeBannerPromoEligible(item?.width_in, item?.height_in);
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

function isLegacyLargeBannerPercentagePromotion(promoDiscount?: PromoDiscountInput | null): boolean {
  if (!promoDiscount || Number(promoDiscount.discountPercentage) !== LARGE_BANNER_PROMO_PERCENTAGE) {
    return false;
  }
  const code = String(promoDiscount.code || '').trim().toUpperCase();
  return code === 'BIG25'
    || promoDiscount.campaign === LARGE_BANNER_RECOVERY_CAMPAIGN
    || promoDiscount.campaign === SEPTEMBER_LARGE_BANNER_CAMPAIGN
    || promoDiscount.discountScope === LARGE_BANNER_RECOVERY_SCOPE
    || promoDiscount.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE;
}

/**
 * Compatibility helper used by the existing cart store.
 *
 * - With no manual code, it returns the automatic qualifying-banner subtotal.
 * - Legacy BIG25/recovery 25% codes are redundant now, so they resolve to the
 *   same automatic qualifying-banner subtotal and can never stack.
 * - Other manual codes keep their original scope/base behavior.
 */
export function getPromoDiscountSubtotalCents(
  items: PromoDiscountCartItem[],
  subtotalCents: number,
  promoDiscount?: PromoDiscountInput | null,
): number {
  const automaticSubtotalCents = getAutomaticLargeBannerSubtotalCents(items);
  if (!promoDiscount || isLegacyLargeBannerPercentagePromotion(promoDiscount)) {
    return automaticSubtotalCents;
  }

  const safeSubtotalCents = Number.isSafeInteger(subtotalCents) && subtotalCents >= 0
    ? subtotalCents
    : 0;

  if (promoDiscount.discountScope !== LARGE_BANNER_RECOVERY_SCOPE) {
    return safeSubtotalCents;
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

// ============================================================================
// CORE RESOLVER
// ============================================================================

function safeMoney(value: number | null | undefined): number {
  const numeric = Number(value || 0);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
}

function manualPromoCandidate(
  promoDiscount: PromoDiscountInput | null | undefined,
  promoBaseCents: number,
): DiscountCandidate | null {
  if (!promoDiscount || isLegacyLargeBannerPercentagePromotion(promoDiscount)) return null;

  const safeBaseCents = safeMoney(promoBaseCents);
  let amountCents = 0;
  let rate = 0;

  const percentage = Number(promoDiscount.discountPercentage || 0);
  const fixedAmountCents = Number(promoDiscount.discountAmountCents || 0);
  if (percentage > 0) {
    rate = percentage / 100;
    amountCents = Math.round(safeBaseCents * rate);
  } else if (fixedAmountCents > 0) {
    amountCents = Math.min(Math.round(fixedAmountCents), safeBaseCents);
    rate = safeBaseCents > 0 ? amountCents / safeBaseCents : 0;
  }

  if (promoDiscount.discountScope === LARGE_BANNER_RECOVERY_SCOPE) {
    const cap = Number(promoDiscount.maxDiscountAmountCents);
    amountCents = Number.isSafeInteger(cap) && cap > 0
      ? Math.min(amountCents, cap)
      : 0;
  }
  if (amountCents <= 0) return null;

  const code = String(promoDiscount.code || '').trim().toUpperCase();
  const descriptor = percentage > 0
    ? `${percentage}% off`
    : `$${(amountCents / 100).toFixed(2)} off`;
  return {
    source: 'promo_code',
    type: 'promo',
    id: code || 'PROMO_CODE',
    label: `${code || 'Promo'} (${descriptor})`,
    amountCents,
    rate,
    priority: 2,
  };
}

function winningCandidate(candidates: DiscountCandidate[]): DiscountCandidate | null {
  return candidates
    .filter((candidate) => candidate.amountCents > 0)
    .sort((a, b) => (
      b.amountCents - a.amountCents
      || b.priority - a.priority
      || a.id.localeCompare(b.id)
    ))[0] ?? null;
}

/** Resolve quantity, automatic and manual candidates; apply only one. */
export function resolveBestDiscount(input: DiscountResolverInput): ResolvedDiscount {
  const subtotalCents = safeMoney(input.subtotalCents);
  const quantityBaseCents = input.quantitySubtotalCents == null
    ? subtotalCents
    : safeMoney(input.quantitySubtotalCents);
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const legacyLargeBannerPromo = isLegacyLargeBannerPercentagePromotion(input.promoDiscount);

  // Existing Zustand callers pass the automatic eligible subtotal through the
  // historical promoSubtotalCents slot when no code (or a redundant BIG25 /
  // recovery 25 code) is present. New callers should pass the explicit field.
  const automaticBaseCents = input.automaticPromotionSubtotalCents == null
    ? ((!input.promoDiscount || legacyLargeBannerPromo) ? safeMoney(input.promoSubtotalCents) : 0)
    : safeMoney(input.automaticPromotionSubtotalCents);

  const manualPromoBaseCents = input.promoDiscount && !legacyLargeBannerPromo
    ? (input.promoSubtotalCents == null ? subtotalCents : safeMoney(input.promoSubtotalCents))
    : 0;

  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);
  const quantityCandidate: DiscountCandidate | null = quantityDiscountAmountCents > 0
    ? {
        source: 'quantity',
        type: 'quantity',
        id: 'QUANTITY_DISCOUNT',
        label: `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`,
        amountCents: quantityDiscountAmountCents,
        rate: quantityDiscountRate,
        priority: 1,
      }
    : null;

  const automaticPromotionAmountCents = Math.round(automaticBaseCents * LARGE_BANNER_PROMO_RATE);
  const automaticCandidate: DiscountCandidate | null = automaticPromotionAmountCents > 0
    ? {
        source: 'automatic',
        type: 'promo',
        id: LARGE_BANNER_PROMO_ID,
        label: LARGE_BANNER_PROMO_LABEL,
        amountCents: automaticPromotionAmountCents,
        rate: LARGE_BANNER_PROMO_RATE,
        priority: 3,
      }
    : null;

  const manualCandidate = manualPromoCandidate(input.promoDiscount, manualPromoBaseCents);
  const candidates = [quantityCandidate, automaticCandidate, manualCandidate]
    .filter((candidate): candidate is DiscountCandidate => Boolean(candidate));
  const winner = winningCandidate(candidates);

  let helperMessage: string | null = null;
  if (candidates.length > 1 && winner) {
    if (winner.source === 'automatic' && manualCandidate?.rate > 0) {
      helperMessage = LARGE_BANNER_PERCENT_DISCOUNT_CONFLICT_MESSAGE;
    } else if (winner.source === 'automatic') {
      helperMessage = 'Only one discount can apply — we used the 25% large-banner discount because it saves you more.';
    } else {
      helperMessage = "Discounts can't be combined — we applied the best one.";
    }
  }

  const winningPromo = winner?.type === 'promo' ? winner : null;
  const manualPromoDiscountAmountCents = manualCandidate?.amountCents || 0;
  const manualPromoDiscountRate = manualCandidate?.rate || 0;
  const manualPromoDiscountCode = manualCandidate?.id || null;

  return {
    appliedDiscountType: winner?.type || 'none',
    appliedDiscountLabel: winner?.label || '',
    appliedDiscountAmountCents: winner?.amountCents || 0,
    appliedDiscountRate: winner?.rate || 0,
    appliedPromotionSource: winner?.source || 'none',
    appliedPromotionId: winner?.id || null,

    quantityDiscountAvailable: quantityDiscountAmountCents > 0,
    quantityDiscountAmountCents,
    quantityDiscountRate,

    promoDiscountAvailable: Boolean(winningPromo),
    promoDiscountAmountCents: winningPromo?.amountCents || 0,
    promoDiscountCode: winningPromo?.id || null,
    promoDiscountRate: winningPromo?.rate || 0,

    manualPromoDiscountAvailable: Boolean(manualCandidate),
    manualPromoDiscountAmountCents,
    manualPromoDiscountCode,
    manualPromoDiscountRate,

    automaticPromotionEligible: automaticBaseCents > 0,
    automaticPromotionId: LARGE_BANNER_PROMO_ID,
    automaticPromotionLabel: LARGE_BANNER_PROMO_LABEL,
    automaticPromotionAmountCents,
    automaticPromotionRate: LARGE_BANNER_PROMO_RATE,

    helperMessage,
  };
}

/** Calculate final totals after resolving the single best discount. */
export function calculateTotalsWithBestDiscount(
  subtotalCents: number,
  quantity: number,
  taxRate: number,
  promoDiscount?: PromoDiscountInput | null,
  automaticPromotionSubtotalCents = 0,
  promoSubtotalCents?: number,
): {
  subtotalCents: number;
  discount: ResolvedDiscount;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
} {
  const discount = resolveBestDiscount({
    subtotalCents,
    quantity,
    promoDiscount,
    automaticPromotionSubtotalCents,
    promoSubtotalCents,
  });
  const subtotalAfterDiscountCents = Math.max(0, subtotalCents - discount.appliedDiscountAmountCents);
  const taxCents = Math.round(subtotalAfterDiscountCents * taxRate);
  const shippingCents = 0;
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
