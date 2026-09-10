/**
 * Unified Pricing Module - Single Source of Truth
 *
 * This module contains shared order-pricing calculations used by Cart,
 * Checkout, Email, My Orders, and Admin presentation paths.
 */

import {
  getPromoDiscountSubtotalCents,
  resolveBestDiscount,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
} from './discount-resolver';
import { getProductConfig, DEFAULT_PRODUCT_TYPE } from './products';

// ============================================================================
// CONSTANTS — derived from the product registry
// ============================================================================

const bannerConfig = getProductConfig(DEFAULT_PRODUCT_TYPE);

export const TAX_RATE = bannerConfig.taxRate;
export const POLE_POCKET_SETUP_FEE_CENTS = bannerConfig.polePockets.setupFeeCents;
export const POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS = bannerConfig.polePockets.pricePerLinearFootCents;
export const ROPE_PRICE_PER_FOOT_CENTS = bannerConfig.rope.pricePerFootCents;

// ============================================================================
// TYPES
// ============================================================================

export interface OrderItemInput {
  id?: string;
  width_in: number;
  height_in: number;
  quantity: number;
  material?: string;
  grommets?: string;
  rope_feet?: number;
  pole_pockets?: string;
  area_sqft?: number;
  unit_price_cents?: number;
  rope_cost_cents?: number;
  pole_pocket_cost_cents?: number;
  line_total_cents?: number;
  file_key?: string;
  file_name?: string;
  file_url?: string;
  rope_pricing_mode?: 'per_item' | 'per_order';
  pole_pocket_pricing_mode?: 'per_item' | 'per_order';
  pole_pocket_size?: string;
  pole_pocket_position?: string;
  poles_quantity?: number;
  poles_unit_price_cents?: number;
  poles_total_cents?: number;
  product_type?: string;
}

export interface PricingBreakdown {
  base_banner_cents: number;
  rope_cents: number;
  pole_pocket_cents: number;
  poles_cents: number;
  subtotal_cents: number;
}

export interface OrderTotals {
  subtotal_cents: number;
  total_quantity: number;

  // Exactly one discount is applied.
  applied_discount_type: 'quantity' | 'promo' | 'none';
  applied_discount_cents: number;
  applied_discount_label: string;
  applied_promotion_id: string | null;
  helper_message: string | null;

  // Candidate quantity tier retained for display/audit purposes.
  quantity_discount_rate: number;
  quantity_discount_cents: number;

  subtotal_after_discount_cents: number;
  tax_cents: number;
  total_cents: number;
}

export interface BreakdownLine {
  label: string;
  value_cents: number;
  description?: string;
}

// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================

/** Calculate rope cost for an item, including legacy data formats. */
export function calculateRopeCost(item: OrderItemInput): number {
  if (item.rope_cost_cents !== undefined && item.rope_cost_cents !== null) {
    return item.rope_cost_cents;
  }
  if (!item.rope_feet || item.rope_feet === 0) return 0;

  const mode = item.rope_pricing_mode || 'per_item';
  const multiplier = mode === 'per_item' ? item.quantity : 1;
  return Math.round(item.rope_feet * ROPE_PRICE_PER_FOOT_CENTS * multiplier);
}

/** Calculate pole-pocket cost for an item. */
export function calculatePolePocketCost(item: OrderItemInput): number {
  if (item.pole_pocket_cost_cents !== undefined && item.pole_pocket_cost_cents !== null) {
    return item.pole_pocket_cost_cents;
  }
  if (!item.pole_pockets || item.pole_pockets === 'none') return 0;

  const mode = item.pole_pocket_pricing_mode || 'per_item';
  const multiplier = mode === 'per_item' ? item.quantity : 1;
  const widthFt = item.width_in / 12;
  let linearFeet = 0;

  if (item.pole_pockets === 'top' || item.pole_pockets === 'bottom') {
    linearFeet = widthFt;
  } else if (item.pole_pockets === 'top-bottom') {
    linearFeet = widthFt * 2;
  }

  const linearCost = Math.round(linearFeet * POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS);
  return (POLE_POCKET_SETUP_FEE_CENTS + linearCost) * multiplier;
}

/** Calculate poles cost when ordered as an add-on. */
export function calculatePolesCost(item: OrderItemInput): number {
  if (item.poles_total_cents !== undefined && item.poles_total_cents !== null) {
    return item.poles_total_cents;
  }
  if (!item.poles_quantity || item.poles_quantity === 0) return 0;
  return (item.poles_unit_price_cents || 0) * item.poles_quantity;
}

/** Calculate base banner cost. */
export function calculateBaseBannerCost(item: OrderItemInput): number {
  if (item.unit_price_cents !== undefined && item.unit_price_cents !== null) {
    return item.unit_price_cents * item.quantity;
  }

  // Production data should always contain unit_price_cents. Keep the existing
  // legacy fallback fail-closed instead of inventing a price from area alone.
  if (item.area_sqft) return 0;
  return 0;
}

/** Get the complete stored pricing breakdown for an item. */
export function getItemPricingBreakdown(item: OrderItemInput): PricingBreakdown {
  const base_banner_cents = calculateBaseBannerCost(item);
  const rope_cents = calculateRopeCost(item);
  const pole_pocket_cents = calculatePolePocketCost(item);
  const poles_cents = calculatePolesCost(item);
  const subtotal_cents = base_banner_cents + rope_cents + pole_pocket_cents + poles_cents;

  return {
    base_banner_cents,
    rope_cents,
    pole_pocket_cents,
    poles_cents,
    subtotal_cents,
  };
}

/**
 * Calculate order totals from an array of items.
 *
 * The same item-aware resolver used by the live cart is used here so order
 * emails and admin summaries cannot drift from checkout. Qualifying banner
 * lines measuring at least 6′ × 3′ receive the automatic 25% price; 6′ × 2′,
 * yard signs, car magnets, and other nonqualifying lines remain full price.
 */
export function calculateOrderTotals(
  items: OrderItemInput[],
  promoDiscount?: PromoDiscountInput | null,
): OrderTotals {
  const pricedItems = items.map((item, index) => {
    const breakdown = getItemPricingBreakdown(item);
    const discountItem: PromoDiscountCartItem = {
      id: item.id || item.file_key || `order-item-${index}`,
      product_type: item.product_type || DEFAULT_PRODUCT_TYPE,
      width_in: item.width_in,
      height_in: item.height_in,
      line_total_cents: breakdown.subtotal_cents,
    };
    return { item, breakdown, discountItem };
  });

  const subtotal_cents = pricedItems.reduce(
    (sum, entry) => sum + entry.breakdown.subtotal_cents,
    0,
  );
  const total_quantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const bannerEntries = pricedItems.filter(({ item }) => {
    const productType = String(item.product_type || DEFAULT_PRODUCT_TYPE).trim().toLowerCase();
    return productType !== 'yard_sign' && productType !== 'car_magnet';
  });
  const bannerQuantity = bannerEntries.reduce((sum, entry) => sum + entry.item.quantity, 0);
  const bannerSubtotalCents = bannerEntries.reduce(
    (sum, entry) => sum + entry.breakdown.subtotal_cents,
    0,
  );

  const discountItems = pricedItems.map((entry) => entry.discountItem);
  const effectivePromoDiscount = promoDiscount || null;
  const promoSubtotalCents = getPromoDiscountSubtotalCents(
    discountItems,
    subtotal_cents,
    effectivePromoDiscount,
  );

  const resolved = resolveBestDiscount({
    subtotalCents: subtotal_cents,
    quantity: bannerQuantity,
    quantitySubtotalCents: bannerSubtotalCents,
    promoDiscount: effectivePromoDiscount,
    promoSubtotalCents,
  });

  const subtotal_after_discount_cents = subtotal_cents - resolved.appliedDiscountAmountCents;
  const tax_cents = Math.round(subtotal_after_discount_cents * TAX_RATE);
  const total_cents = subtotal_after_discount_cents + tax_cents;

  return {
    subtotal_cents,
    total_quantity,
    applied_discount_type: resolved.appliedDiscountType,
    applied_discount_cents: resolved.appliedDiscountAmountCents,
    applied_discount_label: resolved.appliedDiscountLabel,
    applied_promotion_id: resolved.promotionId,
    helper_message: resolved.helperMessage,
    quantity_discount_rate: resolved.quantityDiscountRate,
    quantity_discount_cents: resolved.quantityDiscountAmountCents,
    subtotal_after_discount_cents,
    tax_cents,
    total_cents,
  };
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

export function formatDimensions(widthIn: number, heightIn: number): string {
  return `${widthIn}" × ${heightIn}"`;
}

export function formatArea(sqFt: number): string {
  return `${sqFt.toFixed(2)} sq ft`;
}

export function formatPolePocketDescription(item: OrderItemInput): string {
  if (!item.pole_pockets || item.pole_pockets === 'none') return '';

  const parts: string[] = [];
  if (item.pole_pocket_position || item.pole_pockets) {
    parts.push(item.pole_pocket_position || item.pole_pockets);
  }
  if (item.pole_pocket_size) parts.push(`${item.pole_pocket_size}" pocket`);
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

/** Generate formatted breakdown lines for an item. */
export function generateItemBreakdown(item: OrderItemInput): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  const breakdown = getItemPricingBreakdown(item);

  if (breakdown.base_banner_cents > 0) {
    lines.push({ label: 'Base Total', value_cents: breakdown.base_banner_cents });
    lines.push({
      label: 'Unit Price',
      value_cents: item.unit_price_cents || 0,
      description: `${item.quantity} ${item.quantity === 1 ? 'unit' : 'units'}`,
    });
  }

  if (breakdown.rope_cents > 0 && item.rope_feet) {
    lines.push({
      label: 'Rope',
      value_cents: breakdown.rope_cents,
      description: `${item.rope_feet.toFixed(2)} ft`,
    });
  }

  if (breakdown.pole_pocket_cents > 0) {
    const desc = formatPolePocketDescription(item);
    lines.push({
      label: 'Pole Pockets',
      value_cents: breakdown.pole_pocket_cents,
      description: desc || 'Setup + Linear ft',
    });
  }

  if (breakdown.poles_cents > 0 && item.poles_quantity) {
    lines.push({
      label: 'Poles',
      value_cents: breakdown.poles_cents,
      description: `${item.poles_quantity} poles`,
    });
  }

  return lines;
}

/** Generate order summary lines for cart, checkout, email, and admin views. */
export function generateOrderSummary(
  items: OrderItemInput[],
  promoDiscount?: PromoDiscountInput | null,
): BreakdownLine[] {
  const totals = calculateOrderTotals(items, promoDiscount);
  const lines: BreakdownLine[] = [
    { label: 'Subtotal', value_cents: totals.subtotal_cents },
  ];

  if (totals.applied_discount_cents > 0) {
    lines.push({
      label: totals.applied_discount_label,
      value_cents: -totals.applied_discount_cents,
      description: totals.helper_message || undefined,
    });
  }

  lines.push(
    { label: 'Free Next-Day Air', value_cents: 0 },
    { label: `Tax (${(TAX_RATE * 100).toFixed(0)}%)`, value_cents: totals.tax_cents },
    { label: 'Total', value_cents: totals.total_cents },
  );

  return lines;
}
