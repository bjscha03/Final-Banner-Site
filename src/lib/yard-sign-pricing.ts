import { DEFAULT_YARD_SIGN_SIZE, findYardSignSize, type YardSignSize } from './yardSignSizes';
import { getProductConfig, type PredefinedSize, type MaterialMultiplier } from './products';
import { productDisplayPrice } from './specialtyDisplayPrice';
import type { PromoDiscountInput } from './discount-resolver';
import type { PlacementPreviewManifest } from '@/types/artwork';

const YARD_SIGN_SLUG = 'yard_sign';

// ----- Constants -----
export const YARD_SIGN_WIDTH_IN = DEFAULT_YARD_SIGN_SIZE.widthIn;
export const YARD_SIGN_HEIGHT_IN = DEFAULT_YARD_SIGN_SIZE.heightIn;
export const YARD_SIGN_MAX_QUANTITY = DEFAULT_YARD_SIGN_SIZE.maxQuantity;
export const YARD_SIGN_MAX_DESIGNS = 10;

export const YARD_SIGN_SINGLE_SIDED_CENTS = DEFAULT_YARD_SIGN_SIZE.singleCents;  // $12.00
export const YARD_SIGN_DOUBLE_SIDED_CENTS = DEFAULT_YARD_SIGN_SIZE.doubleCents;   // $14.00
export const YARD_SIGN_STEP_STAKE_CENTS = 150;      // $1.50

export type YardSignSidedness = 'single' | 'double';

// ----- Design row for multi-design support -----
export interface YardSignDesign {
  id: string;
  fileName: string;
  fileUrl: string;
  fileKey: string;
  thumbnailUrl: string;
  isPdf: boolean;
  quantity: number;
  // Preview state: saved when user adjusts in the preview modal
  imgScale?: number;
  imgScaleY?: number;
  imgPos?: { x: number; y: number };
  imgConstrain?: boolean;
  // Thumbnail rendered from the preview state (matches exactly what user saw)
  previewThumbnailUrl?: string;
  placementPreview?: PlacementPreviewManifest;
}

// ----- Pricing result -----
export interface YardSignPricing {
  size: YardSignSize;
  sidedness: YardSignSidedness;
  unitPriceCents: number;       // Price per sign based on sidedness
  totalSignQuantity: number;
  signSubtotalCents: number;    // unitPrice × totalSignQuantity
  addStepStakes: boolean;
  stepStakeQuantity: number;
  stepStakeTotalCents: number;  // $1.50 × stepStakeQuantity
  subtotalCents: number;        // signs + step stakes
  promoDiscountRate: number;    // 0-1 (e.g., 0.2 for 20%)
  promoDiscountCents: number;
  totalCents: number;           // subtotalCents - promoDiscountCents
  taxRate: number;
  taxCents: number;
  totalWithTaxCents: number;
}

/**
 * Get unit price in cents based on sidedness.
 */
export function getYardSignUnitPrice(sidedness: YardSignSidedness, size = DEFAULT_YARD_SIGN_SIZE): number {
  return sidedness === 'double' ? size.doubleCents : size.singleCents;
}

/**
 * Calculate complete yard sign order pricing.
 */
export function calcYardSignPricing(
  sidedness: YardSignSidedness,
  totalSignQuantity: number,
  addStepStakes: boolean,
  stepStakeQuantity: number,
  promotion: number | PromoDiscountInput | null = 0,
  size = DEFAULT_YARD_SIGN_SIZE,
): YardSignPricing {
  const config = getProductConfig(YARD_SIGN_SLUG);

  const unitPriceCents = getYardSignUnitPrice(sidedness, size);
  const signSubtotalCents = unitPriceCents * totalSignQuantity;

  const stepStakeTotalCents = addStepStakes
    ? YARD_SIGN_STEP_STAKE_CENTS * stepStakeQuantity
    : 0;

  const subtotalCents = signSubtotalCents + stepStakeTotalCents;
  const promoDiscountCents = typeof promotion === 'number'
    ? Math.round(subtotalCents * promotion)
    : productDisplayPrice(subtotalCents, promotion, 'yard_sign').discountCents;
  const promoDiscountRate = subtotalCents > 0 ? promoDiscountCents / subtotalCents : 0;
  const totalCents = subtotalCents - promoDiscountCents;
  const taxRate = config.taxRate;
  const taxCents = Math.round(totalCents * taxRate);
  const totalWithTaxCents = totalCents + taxCents;

  return {
    size,
    sidedness,
    unitPriceCents,
    totalSignQuantity,
    signSubtotalCents,
    addStepStakes,
    stepStakeQuantity,
    stepStakeTotalCents,
    subtotalCents,
    promoDiscountRate,
    promoDiscountCents,
    totalCents,
    taxRate,
    taxCents,
    totalWithTaxCents,
  };
}

/**
 * Get total sign quantity across all designs.
 */
export function getTotalDesignQuantity(designs: YardSignDesign[]): number {
  return designs.reduce((sum, d) => sum + d.quantity, 0);
}

/** Move copies between artworks without changing the customer's order quantity. */
export function assignYardSignCopies(designs: YardSignDesign[], id: string, requested: number, step = 1): YardSignDesign[] {
  const target = designs.find(design => design.id === id);
  if (!target || designs.length < 2 || !Number.isFinite(requested)) return designs;

  const max = getTotalDesignQuantity(designs) - (designs.length - 1) * step;
  const quantity = Math.max(step, Math.min(max, Math.round(requested / step) * step));
  let needed = quantity - target.quantity;
  if (needed === 0) return designs;
  return designs.map(design => {
    if (design.id === id) return { ...design, quantity };
    // A negative transfer gives freed copies to the first other artwork.
    const transfer = Math.min(needed, design.quantity - step);
    needed -= transfer;
    return transfer ? { ...design, quantity: design.quantity - transfer } : design;
  });
}

/** Yard signs must be ordered in increments of this value */
export const YARD_SIGN_INCREMENT = DEFAULT_YARD_SIGN_SIZE.perSheet;

/** Minimum yard sign order quantity */
export const YARD_SIGN_MIN_QUANTITY = DEFAULT_YARD_SIGN_SIZE.perSheet;

export function distributeYardSignCopies<T extends { quantity: number }>(designs: T[], total: number, step: number): T[] {
  const units = total / step;
  return designs.map((design, index) => ({
    ...design, quantity: (Math.floor(units / designs.length) + (index < units % designs.length ? 1 : 0)) * step,
  }));
}

export function yardSignQuantityRule(size: YardSignSize) {
  const n = size.perSheet;
  return `Yard signs must be ordered in increments of ${n} (${n}, ${n * 2}, ${n * 3}, etc.).`;
}

export function validateYardSignQuantity(totalQuantity: number, size = DEFAULT_YARD_SIGN_SIZE): { valid: boolean; message?: string } {
  if (totalQuantity === 0) return { valid: false };
  if (totalQuantity < size.perSheet) return { valid: false, message: `Minimum order is ${size.perSheet} yard signs.` };
  if (totalQuantity > size.maxQuantity) {
    return { valid: false, message: `Maximum ${size.maxQuantity} signs per order for 24-hour production. Please place multiple orders.` };
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity % size.perSheet !== 0) {
    return { valid: false, message: yardSignQuantityRule(size) };
  }
  return { valid: true };
}

// ----- Legacy exports for backward compatibility -----
// These are used by existing code that hasn't been updated yet

/**
 * @deprecated Use calcYardSignPricing v2 instead
 */
export function getYardSignBasePrice(widthIn: number, heightIn: number): number {
  return findYardSignSize({ width_in: widthIn, height_in: heightIn })?.singleCents ?? YARD_SIGN_SINGLE_SIDED_CENTS;
}

/**
 * @deprecated Material is now fixed to corrugated
 */
export function getYardSignMaterialMultiplier(materialKey: string): number {
  return 1.0;
}

/**
 * @deprecated No quantity discount tiers — flat per-sign pricing
 */
export function getYardSignQuantityDiscountRate(quantity: number): number {
  return 0;
}

/**
 * Get predefined yard sign sizes.
 */
export function getYardSignSizes(): PredefinedSize[] {
  const config = getProductConfig(YARD_SIGN_SLUG);
  return config.predefinedSizes || [];
}

/**
 * Get yard sign material multipliers.
 */
export function getYardSignMaterials(): MaterialMultiplier[] {
  const config = getProductConfig(YARD_SIGN_SLUG);
  return config.materialMultipliers || [];
}

/** Cart lines are pre-promotion; the shared cart/checkout resolver discounts once. */
export function yardSignCartPricing(pricing: YardSignPricing) {
  return {
    unit_price_cents: pricing.unitPriceCents,
    rope_cost_cents: 0,
    pole_pocket_cost_cents: 0,
    line_total_cents: pricing.subtotalCents,
  };
}
