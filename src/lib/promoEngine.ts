/**
 * Promo Engine - single source of truth for promo-code metadata and
 * best-discount-wins resolution across the storefront UI.
 *
 * Server-side validation (first-order eligibility, expiry, etc.) lives in
 * netlify/functions/validate-discount-code.cjs. This client engine only
 * mirrors the static rate metadata so UI estimates match server reality.
 *
 * USAGE RULES
 * -----------
 *  - Promo codes are NEVER auto-applied. They must come from explicit user
 *    input (e.g. the Apply button on /design or in Checkout).
 *  - Promo discounts do NOT stack with the quantity discount; the resolver
 *    picks the larger of the two ("best discount wins").
 *  - Yard signs are excluded from quantity-discount tiering at the
 *    cart-resolver layer; the per-product engine still computes magnets and
 *    banners through the same tiers.
 */

import {
  resolveBestDiscount,
  calculateTotalsWithBestDiscount,
  type PromoDiscountInput,
  type ResolvedDiscount,
} from './discount-resolver';

export const BEST_DISCOUNT_WINS = true as const;

export interface KnownPromoCode {
  code: string;
  /** Decimal rate, e.g. 0.20 for 20% off. */
  discountPercentage: number;
  /** Free-text description (UI only). */
  description: string;
  /** When true, server-side validation enforces first-order-only eligibility. */
  firstOrderOnly: boolean;
}

/**
 * Static catalogue of promo codes recognized by the client UI for live
 * estimates. The authoritative list lives server-side; this is for display
 * only and must NOT be used to bypass server validation at checkout.
 */
export const KNOWN_PROMO_CODES: Record<string, KnownPromoCode> = {
  NEW20: {
    code: 'NEW20',
    discountPercentage: 20,
    description: '20% off your first order',
    firstOrderOnly: true,
  },
};

export function getKnownPromo(code: string | null | undefined): KnownPromoCode | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return KNOWN_PROMO_CODES[normalized] ?? null;
}

export interface ResolvePromoInput {
  subtotalCents: number;
  /** Quantity counted toward the quantity-discount tier (banner + magnet). */
  quantity: number;
  /** Raw promo code typed by the user, or null if none. */
  code?: string | null;
}

/**
 * Resolve the single best discount (quantity vs. promo) for a given subtotal.
 * Returns the same shape as `resolveBestDiscount` for compatibility.
 */
export function resolvePromo(input: ResolvePromoInput): ResolvedDiscount {
  const promo = getKnownPromo(input.code);
  const promoDiscount: PromoDiscountInput | null = promo
    ? { code: promo.code, discountPercentage: promo.discountPercentage }
    : null;

  return resolveBestDiscount({
    subtotalCents: input.subtotalCents,
    quantity: input.quantity,
    promoDiscount,
  });
}

export interface PromoTotals {
  subtotalCents: number;
  discount: ResolvedDiscount;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Compute final totals (subtotal → best discount → tax → total).
 *
 * @param subtotalCents Raw subtotal BEFORE any discount.
 * @param quantity      Quantity counted for the tier.
 * @param taxRate       Decimal tax rate (e.g. 0.06).
 * @param code          Optional promo code typed by the user.
 */
export function computePromoTotals(
  subtotalCents: number,
  quantity: number,
  taxRate: number,
  code?: string | null,
): PromoTotals {
  const promo = getKnownPromo(code);
  const promoDiscount: PromoDiscountInput | null = promo
    ? { code: promo.code, discountPercentage: promo.discountPercentage }
    : null;

  const totals = calculateTotalsWithBestDiscount(subtotalCents, quantity, taxRate, promoDiscount);
  return {
    subtotalCents: totals.subtotalCents,
    discount: totals.discount,
    subtotalAfterDiscountCents: totals.subtotalAfterDiscountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
  };
}
