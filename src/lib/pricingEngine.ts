/**
 * Pricing Engine — product-agnostic facade.
 *
 * Single entry point for computing pricing across product types so that
 * Quick Quote, /design, cart, and checkout all show identical numbers for
 * the same configuration.
 *
 * Delegates to per-product modules:
 *   - banner       → bannerPricingEngine.ts
 *   - car_magnet   → car-magnet-pricing.ts
 *
 * Yard signs intentionally retain their bespoke pricing in
 * yard-sign-pricing.ts and do NOT participate in the quantity-discount
 * tiers exposed here.
 *
 * USAGE RULES
 * -----------
 *  - Callers MUST NOT do inline price math. Always call calculatePricing().
 *  - The "Quantity Discount" row is ONLY rendered when
 *    `quantityDiscountCents > 0` AND the same amount is reflected in the
 *    returned `subtotalCents` (i.e. the engine has actually applied it).
 *  - Promo discounts are layered on top via promoEngine.resolvePromo() and
 *    follow best-discount-wins (no stacking with the quantity discount).
 */

import { MaterialKey } from '@/store/quote';
import {
  calculateBannerPricing,
  type BannerPricingInput,
  type BannerPricingResult,
} from './bannerPricingEngine';
import {
  calcCarMagnetPricing,
  type CarMagnetPricing,
} from './car-magnet-pricing';

export type PricingProductType = 'banner' | 'car_magnet';

/** Product types that participate in the quantity-discount tiers. */
export const QUANTITY_DISCOUNT_ELIGIBLE_PRODUCT_TYPES: ReadonlySet<string> = new Set([
  'banner',
  'car_magnet',
]);

export function isQuantityDiscountEligible(productType: string | null | undefined): boolean {
  return QUANTITY_DISCOUNT_ELIGIBLE_PRODUCT_TYPES.has((productType || 'banner').toLowerCase());
}

export interface BannerPricingArgs extends BannerPricingInput {
  productType: 'banner';
}

export interface CarMagnetPricingArgs {
  productType: 'car_magnet';
  widthIn: number;
  heightIn: number;
  quantity: number;
}

export type PricingArgs = BannerPricingArgs | CarMagnetPricingArgs;

export interface BreakdownLine {
  label: string;
  amountCents: number;
  /** When true, this line is a discount and should be rendered as -$X. */
  isDiscount?: boolean;
}

export interface UnifiedPricingResult {
  productType: PricingProductType;
  /** Sum of unit*qty + add-ons BEFORE quantity discount. */
  basePriceCents: number;
  /** Add-on cost (rope, pole pockets, etc.). 0 for magnets today. */
  addOnsCents: number;
  /** = basePriceCents + addOnsCents (raw subtotal pre-discount). */
  subtotalBeforeDiscountCents: number;
  /** Decimal rate, e.g. 0.07 for 7%. */
  quantityDiscountRate: number;
  /** Discount amount in cents (>= 0). Only > 0 when subtotal is reduced. */
  quantityDiscountCents: number;
  /** subtotalBeforeDiscountCents - quantityDiscountCents. */
  subtotalCents: number;
  /** Tax computed on subtotalCents. */
  taxCents: number;
  /** subtotalCents + taxCents. */
  totalCents: number;
  /** Itemized breakdown for the standardized PriceBreakdown UI. */
  breakdown: BreakdownLine[];
  /** Underlying engine result for callers that need product-specific fields. */
  raw: BannerPricingResult | CarMagnetPricing;
}

/**
 * Compute pricing for a banner or car magnet using the shared engines.
 *
 * INVARIANT: `subtotalCents === subtotalBeforeDiscountCents - quantityDiscountCents`.
 * Callers can rely on this to never display a "discount applied" row that
 * isn't actually reflected in the total.
 */
export function calculatePricing(args: PricingArgs): UnifiedPricingResult {
  if (args.productType === 'car_magnet') {
    const r = calcCarMagnetPricing(args.widthIn, args.heightIn, args.quantity);
    const breakdown: BreakdownLine[] = [
      { label: 'Base Price', amountCents: r.baseSubtotalCents },
    ];
    if (r.quantityDiscountCents > 0) {
      breakdown.push({
        label: `Quantity Discount (${Math.round(r.quantityDiscountRate * 100)}% off)`,
        amountCents: r.quantityDiscountCents,
        isDiscount: true,
      });
    }
    return {
      productType: 'car_magnet',
      basePriceCents: r.baseSubtotalCents,
      addOnsCents: 0,
      subtotalBeforeDiscountCents: r.baseSubtotalCents,
      quantityDiscountRate: r.quantityDiscountRate,
      quantityDiscountCents: r.quantityDiscountCents,
      subtotalCents: r.subtotalCents,
      taxCents: r.taxCents,
      totalCents: r.totalCents,
      breakdown,
      raw: r,
    };
  }

  // Banner branch.
  const r = calculateBannerPricing({
    widthIn: args.widthIn,
    heightIn: args.heightIn,
    quantity: args.quantity,
    material: args.material as MaterialKey,
    addRope: args.addRope,
    polePockets: args.polePockets,
    grommets: args.grommets,
  });

  const addOnsCents = r.ropeCostCents + r.polePocketCostCents;
  const breakdown: BreakdownLine[] = [
    { label: 'Base Banner', amountCents: r.baseBannerPriceCents },
  ];
  if (r.polePocketCostCents > 0) {
    breakdown.push({ label: 'Pole Pockets', amountCents: r.polePocketCostCents });
  }
  if (r.ropeCostCents > 0) {
    breakdown.push({ label: 'Rope', amountCents: r.ropeCostCents });
  }
  if (r.quantityDiscountCents > 0) {
    breakdown.push({
      label: `Quantity Discount (${Math.round(r.quantityDiscountRate * 100)}% off)`,
      amountCents: r.quantityDiscountCents,
      isDiscount: true,
    });
  }

  return {
    productType: 'banner',
    basePriceCents: r.baseBannerPriceCents,
    addOnsCents,
    subtotalBeforeDiscountCents: r.subtotalBeforeDiscountCents,
    quantityDiscountRate: r.quantityDiscountRate,
    quantityDiscountCents: r.quantityDiscountCents,
    subtotalCents: r.subtotalCents,
    taxCents: r.taxCents,
    totalCents: r.totalCents,
    breakdown,
    raw: r,
  };
}
