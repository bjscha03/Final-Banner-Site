/**
 * Promo Engine - storefront adapter for promo metadata and centralized
 * best-discount-wins resolution.
 *
 * Manual promo-code validation remains server-authoritative. The automatic
 * LARGE_BANNER_25 promotion is derived from the configured item dimensions and
 * therefore needs no code or client-side persisted boolean.
 */

import {
  resolveBestDiscount,
  getAutomaticLargeBannerSubtotalCents,
  getPromoDiscountSubtotalCents,
  calculateTotalsWithBestDiscount,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
  type ResolvedDiscount,
} from './discount-resolver';

export const BEST_DISCOUNT_WINS = true as const;

export interface KnownPromoCode {
  code: string;
  /** Discount percentage as a 1-100 number (e.g. 20 means 20% off). */
  discountPercentage: number;
  /** Free-text description (UI only). */
  description: string;
  /** When true, server-side validation enforces first-order-only eligibility. */
  firstOrderOnly: boolean;
}

/**
 * Static catalogue used only for live estimates after a code is entered. The
 * server validator is authoritative and can reject any client-known code.
 */
export const KNOWN_PROMO_CODES: Record<string, KnownPromoCode> = {
  NEW20: {
    code: 'NEW20',
    discountPercentage: 20,
    description: '20% off your first order',
    firstOrderOnly: true,
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
  /** Server-validated, database-backed promotion metadata. */
  validatedPromo?: PromoDiscountInput | null;
  /** Current cart/configurator lines used for scoped and automatic offers. */
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

/** Resolve quantity, automatic large-banner, and manual promo candidates. */
export function resolvePromo(input: ResolvePromoInput): ResolvedDiscount {
  const promo = getKnownPromo(input.code);
  const promoDiscount: PromoDiscountInput | null = matchingValidatedPromo(input)
    || (promo ? { code: promo.code, discountPercentage: promo.discountPercentage } : null);
  const items = Array.isArray(input.items) ? input.items : [];
  const automaticPromotionSubtotalCents = getAutomaticLargeBannerSubtotalCents(items);
  const promoSubtotalCents = promoDiscount
    ? getPromoDiscountSubtotalCents(items, input.subtotalCents, promoDiscount)
    : undefined;

  return resolveBestDiscount({
    subtotalCents: input.subtotalCents,
    quantity: input.quantity,
    promoDiscount,
    promoSubtotalCents,
    automaticPromotionSubtotalCents,
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
 * Compute totals for callers that do not have item dimensions. Item-aware
 * configurators and carts should use resolvePromo so automatic eligibility can
 * be derived from their lines.
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
