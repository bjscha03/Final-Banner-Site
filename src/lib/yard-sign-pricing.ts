/**
 * Yard Sign Pricing Module (v2)
 * 
 * Simplified flat-rate pricing for 24" × 18" corrugated plastic yard signs.
 * 
 * Business rules:
 * - Single size: 24" × 18"
 * - Single-Sided: $12/sign, Double-Sided: $14/sign
 * - Step Stakes: $1.50 each (optional add-on)
 * - Max 90 signs per order for 24-hour production
 * - FREE Next-Day Air shipping
 */

import { getProductConfig, type PredefinedSize, type MaterialMultiplier } from './products';

const YARD_SIGN_SLUG = 'yard_sign';

// ----- Constants -----
export const YARD_SIGN_WIDTH_IN = 24;
export const YARD_SIGN_HEIGHT_IN = 18;
export const YARD_SIGN_MAX_QUANTITY = 90;
export const YARD_SIGN_MAX_DESIGNS = 10;

export const YARD_SIGN_SINGLE_SIDED_CENTS = 1200;  // $12.00
export const YARD_SIGN_DOUBLE_SIDED_CENTS = 1400;   // $14.00
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
}

// ----- Pricing result -----
export interface YardSignPricing {
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
export function getYardSignUnitPrice(sidedness: YardSignSidedness): number {
  return sidedness === 'double' ? YARD_SIGN_DOUBLE_SIDED_CENTS : YARD_SIGN_SINGLE_SIDED_CENTS;
}

/**
 * Calculate complete yard sign order pricing.
 */
export function calcYardSignPricing(
  sidedness: YardSignSidedness,
  totalSignQuantity: number,
  addStepStakes: boolean,
  stepStakeQuantity: number,
  promoDiscountRate: number = 0,
): YardSignPricing {
  const config = getProductConfig(YARD_SIGN_SLUG);

  const unitPriceCents = getYardSignUnitPrice(sidedness);
  const signSubtotalCents = unitPriceCents * totalSignQuantity;

  const stepStakeTotalCents = addStepStakes
    ? YARD_SIGN_STEP_STAKE_CENTS * stepStakeQuantity
    : 0;

  const subtotalCents = signSubtotalCents + stepStakeTotalCents;
  const promoDiscountCents = Math.round(subtotalCents * promoDiscountRate);
  const totalCents = subtotalCents - promoDiscountCents;
  const taxRate = config.taxRate;
  const taxCents = Math.round(totalCents * taxRate);
  const totalWithTaxCents = totalCents + taxCents;

  return {
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

/**
 * Validate that total quantity doesn't exceed max.
 */
export function validateYardSignQuantity(totalQuantity: number): { valid: boolean; message?: string } {
  if (totalQuantity < 1) {
    return { valid: false, message: 'Please add at least 1 sign.' };
  }
  if (totalQuantity > YARD_SIGN_MAX_QUANTITY) {
    return { valid: false, message: `Maximum ${YARD_SIGN_MAX_QUANTITY} signs per order for 24-hour production. Need more? Place a second order.` };
  }
  return { valid: true };
}

// ----- Legacy exports for backward compatibility -----
// These are used by existing code that hasn't been updated yet

/**
 * @deprecated Use calcYardSignPricing v2 instead
 */
export function getYardSignBasePrice(widthIn: number, heightIn: number): number {
  return YARD_SIGN_SINGLE_SIDED_CENTS;
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
