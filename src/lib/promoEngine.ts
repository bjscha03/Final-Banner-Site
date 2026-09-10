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
  getPromoDiscountSubtotalCents,
  calculateTotalsWithBestDiscount,
  SMALL_BANNER_PROMOTION_CAMPAIGN,
  SMALL_BANNER_PROMOTION_SCOPE,
  type DiscountScope,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
  type ResolvedDiscount,
} from './discount-resolver';

export const BEST_DISCOUNT_WINS = true as const;

export interface KnownPromoCode {
  code: string;
  /**
   * Discount percentage as a 1-100 number (e.g. 20 means 20% off). This
   * matches the wire shape used by `PromoDiscountInput.discountPercentage`
   * in `discount-resolver.ts`.
   */
  discountPercentage: number;
  /** Free-text description (UI only). */
  description: string;
  /** When true, server-side validation enforces first-order-only eligibility. */
  firstOrderOnly: boolean;
  /**
   * When set, this code only discounts cart/configurator lines matching this
   * scope (e.g. small banners). Omitted for order-wide codes like NEW20.
   */
  discountScope?: DiscountScope;
  /**
   * Required alongside a scoped `discountScope` — `getPromoDiscountSubtotalCents`
   * enforces an exact code + percentage + scope + campaign match before it
   * will compute a non-zero scoped subtotal.
   */
  campaign?: string;
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
  // Virtual, reusable code for banners smaller than 6' x 3'. Banners 6' x 3'
  // or larger receive the automatic 25% Large Banner promotion instead — the
  // two never stack (see discount-resolver.ts / recovery-discount-policy.cjs).
  '20OFF': {
    code: '20OFF',
    discountPercentage: 20,
    description: "20% off banners smaller than 6' x 3'",
    firstOrderOnly: false,
    discountScope: SMALL_BANNER_PROMOTION_SCOPE,
    campaign: SMALL_BANNER_PROMOTION_CAMPAIGN,
  },
  CUSTOM60: {
    code: 'CUSTOM60',
    discountPercentage: 60,
    description: '60% off your order (one-time use)',
    firstOrderOnly: false,
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
  /**
   * Promo metadata returned by the server validator. This lets reusable,
   * database-backed offers (including trade-show codes) render the same live
   * estimate as checkout without adding every generated code to this bundle.
   */
  validatedPromo?: PromoDiscountInput | null;
  /** Current cart/configurator lines used to calculate scoped promotions. */
  items?: PromoDiscountCartItem[];
}

function matchingValidatedPromo(input: ResolvePromoInput): PromoDiscountInput | null {
  const requestedCode = String(input.code || '').trim().toUpperCase();
  const validatedCode = String(input.validatedPromo?.code || '').trim().toUpperCase();
  if (!requestedCode || validatedCode !== requestedCode) return null;

  const discountPercentage = Number(input.validatedPromo?.discountPercentage || 0);
  const discountAmountCents = Number(input.validatedPromo?.discountAmountCents || 0);
  if (discountPercentage <= 0 && discountAmountCents <= 0) return null;

  return {
    code: validatedCode,
    ...(discountPercentage > 0 ? { discountPercentage } : {}),
    ...(discountAmountCents > 0 ? { discountAmountCents } : {}),
    ...(input.validatedPromo?.campaign ? { campaign: input.validatedPromo.campaign } : {}),
    ...(input.validatedPromo?.discountScope ? { discountScope: input.validatedPromo.discountScope } : {}),
    ...(input.validatedPromo?.eligibleCartItemIds ? { eligibleCartItemIds: input.validatedPromo.eligibleCartItemIds } : {}),
    ...(input.validatedPromo?.maxDiscountAmountCents
      ? { maxDiscountAmountCents: input.validatedPromo.maxDiscountAmountCents }
      : {}),
  };
}

/**
 * Resolve the single best discount (quantity vs. promo) for a given subtotal.
 * Returns the same shape as `resolveBestDiscount` for compatibility.
 */
export function resolvePromo(input: ResolvePromoInput): ResolvedDiscount {
  const promo = getKnownPromo(input.code);
  const promoDiscount: PromoDiscountInput | null = matchingValidatedPromo(input)
    || (promo
      ? {
          code: promo.code,
          discountPercentage: promo.discountPercentage,
          ...(promo.discountScope ? { discountScope: promo.discountScope } : {}),
          ...(promo.campaign ? { campaign: promo.campaign } : {}),
        }
      : null);
  const promoSubtotalCents = Array.isArray(input.items)
    ? getPromoDiscountSubtotalCents(input.items, input.subtotalCents, promoDiscount)
    : undefined;

  return resolveBestDiscount({
    subtotalCents: input.subtotalCents,
    quantity: input.quantity,
    promoDiscount,
    promoSubtotalCents,
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
