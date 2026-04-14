/**
 * Yard Sign Pricing Module
 * 
 * Flat-rate pricing for yard signs with material multipliers
 * and quantity discounts. Prices include FREE Next-Day Air shipping.
 */

import { getProductConfig, type PredefinedSize, type MaterialMultiplier } from './products';

const YARD_SIGN_SLUG = 'yard_sign';

/**
 * Get the base price in cents for a given yard sign size.
 * Returns the basePriceCents from the predefined size that matches.
 */
export function getYardSignBasePrice(widthIn: number, heightIn: number): number {
  const config = getProductConfig(YARD_SIGN_SLUG);
  const sizes = config.predefinedSizes || [];
  const match = sizes.find(s => s.widthIn === widthIn && s.heightIn === heightIn);
  return match?.basePriceCents ?? 0;
}

/**
 * Get the material multiplier for a yard sign material key.
 */
export function getYardSignMaterialMultiplier(materialKey: string): number {
  const config = getProductConfig(YARD_SIGN_SLUG);
  const multipliers = config.materialMultipliers || [];
  const match = multipliers.find(m => m.key === materialKey);
  return match?.multiplier ?? 1.0;
}

/**
 * Get the quantity discount rate for yard signs.
 * Uses the yard sign-specific tiers from the product registry.
 */
export function getYardSignQuantityDiscountRate(quantity: number): number {
  const config = getProductConfig(YARD_SIGN_SLUG);
  const tiers = config.quantityDiscountTiers;
  let rate = 0;
  for (const tier of tiers) {
    if (quantity >= tier.minQuantity) {
      rate = tier.discountRate;
    } else {
      break;
    }
  }
  return rate;
}

export interface YardSignPricing {
  basePriceCents: number;       // Base price for selected size
  materialMultiplier: number;   // Material multiplier applied
  unitPriceCents: number;       // Price per unit after material multiplier
  quantity: number;
  subtotalCents: number;        // unitPrice × quantity
  discountRate: number;         // Quantity discount rate
  discountCents: number;        // Discount amount
  totalCents: number;           // After discount, before tax
  taxCents: number;
  totalWithTaxCents: number;
}

/**
 * Calculate complete yard sign pricing.
 */
export function calcYardSignPricing(
  widthIn: number,
  heightIn: number,
  materialKey: string,
  quantity: number
): YardSignPricing {
  const config = getProductConfig(YARD_SIGN_SLUG);
  const basePriceCents = getYardSignBasePrice(widthIn, heightIn);
  const materialMultiplier = getYardSignMaterialMultiplier(materialKey);
  const unitPriceCents = Math.round(basePriceCents * materialMultiplier);
  const subtotalCents = unitPriceCents * quantity;
  const discountRate = getYardSignQuantityDiscountRate(quantity);
  const discountCents = Math.round(subtotalCents * discountRate);
  const totalCents = subtotalCents - discountCents;
  const taxCents = Math.round(totalCents * config.taxRate);
  const totalWithTaxCents = totalCents + taxCents;

  return {
    basePriceCents,
    materialMultiplier,
    unitPriceCents,
    quantity,
    subtotalCents,
    discountRate,
    discountCents,
    totalCents,
    taxCents,
    totalWithTaxCents,
  };
}

/**
 * Get all predefined yard sign sizes.
 */
export function getYardSignSizes(): PredefinedSize[] {
  const config = getProductConfig(YARD_SIGN_SLUG);
  return config.predefinedSizes || [];
}

/**
 * Get all yard sign material multipliers.
 */
export function getYardSignMaterials(): MaterialMultiplier[] {
  const config = getProductConfig(YARD_SIGN_SLUG);
  return config.materialMultipliers || [];
}
