/**
 * Unified Pricing Module - Single Source of Truth
 * 
 * This module contains ALL pricing calculations for the application.
 * All touchpoints (Cart, Checkout, Email, My Orders, Admin) use these functions.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const TAX_RATE = 0.06; // 6%
export const POLE_POCKET_SETUP_FEE_CENTS = 1500; // $15.00
export const POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS = 200; // $2.00/ft
export const ROPE_PRICE_PER_FOOT_CENTS = 200; // $2.00/ft

// ============================================================================
// TYPES
// ============================================================================

export interface OrderItemInput {
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

/**
 * Calculate rope cost for an item
 * Handles backward compatibility with old data formats
 */
export function calculateRopeCost(item: OrderItemInput): number {
  // If we have the pre-calculated value, use it
  if (item.rope_cost_cents !== undefined && item.rope_cost_cents !== null) {
    return item.rope_cost_cents;
  }
  
  // Otherwise calculate from rope_feet
  if (!item.rope_feet || item.rope_feet === 0) {
    return 0;
  }
  
  const mode = item.rope_pricing_mode || 'per_item';
  const multiplier = mode === 'per_item' ? item.quantity : 1;
  
  return Math.round(item.rope_feet * ROPE_PRICE_PER_FOOT_CENTS * multiplier);
}

/**
 * Calculate pole pocket cost for an item
 */
export function calculatePolePocketCost(item: OrderItemInput): number {
  // If we have the pre-calculated value, use it
  if (item.pole_pocket_cost_cents !== undefined && item.pole_pocket_cost_cents !== null) {
    return item.pole_pocket_cost_cents;
  }
  
  // If no pole pockets, return 0
  if (!item.pole_pockets || item.pole_pockets === 'none') {
    return 0;
  }
  
  const mode = item.pole_pocket_pricing_mode || 'per_item';
  const multiplier = mode === 'per_item' ? item.quantity : 1;
  
  // Calculate linear feet based on position
  let linearFeet = 0;
  const widthFt = item.width_in / 12;
  
  if (item.pole_pockets === 'top' || item.pole_pockets === 'bottom') {
    linearFeet = widthFt;
  } else if (item.pole_pockets === 'top-bottom') {
    linearFeet = widthFt * 2;
  }
  
  const setupFee = POLE_POCKET_SETUP_FEE_CENTS;
  const linearCost = Math.round(linearFeet * POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS);
  
  return (setupFee + linearCost) * multiplier;
}

/**
 * Calculate poles cost (when ordered as add-on)
 */
export function calculatePolesCost(item: OrderItemInput): number {
  if (item.poles_total_cents !== undefined && item.poles_total_cents !== null) {
    return item.poles_total_cents;
  }
  
  if (!item.poles_quantity || item.poles_quantity === 0) {
    return 0;
  }
  
  const unitPrice = item.poles_unit_price_cents || 0;
  return unitPrice * item.poles_quantity;
}

/**
 * Calculate base banner cost
 */
export function calculateBaseBannerCost(item: OrderItemInput): number {
  if (item.unit_price_cents !== undefined && item.unit_price_cents !== null) {
    return item.unit_price_cents * item.quantity;
  }
  
  // Fallback: calculate from area if available
  if (item.area_sqft) {
    // This would need the pricing tier logic - for now return 0
    // In practice, unit_price_cents should always be set
    return 0;
  }
  
  return 0;
}

/**
 * Get complete pricing breakdown for an item
 */
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
 * Calculate order totals from array of items
 */
export function calculateOrderTotals(items: OrderItemInput[]): OrderTotals {
  const subtotal_cents = items.reduce((sum, item) => {
    const breakdown = getItemPricingBreakdown(item);
    return sum + breakdown.subtotal_cents;
  }, 0);
  
  const tax_cents = Math.round(subtotal_cents * TAX_RATE);
  const total_cents = subtotal_cents + tax_cents;
  
  return {
    subtotal_cents,
    tax_cents,
    total_cents,
  };
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format dimensions for display
 */
export function formatDimensions(widthIn: number, heightIn: number): string {
  return `${widthIn}" × ${heightIn}"`;
}

/**
 * Format area for display
 */
export function formatArea(sqFt: number): string {
  return `${sqFt.toFixed(2)} sq ft`;
}

/**
 * Format pole pocket description
 */
export function formatPolePocketDescription(item: OrderItemInput): string {
  if (!item.pole_pockets || item.pole_pockets === 'none') {
    return '';
  }
  
  const parts: string[] = [];
  
  // Add position
  if (item.pole_pocket_position || item.pole_pockets) {
    const position = item.pole_pocket_position || item.pole_pockets;
    parts.push(position);
  }
  
  // Add size
  if (item.pole_pocket_size) {
    parts.push(`${item.pole_pocket_size}" pocket`);
  }
  
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

/**
 * Generate formatted breakdown lines for an item
 */
export function generateItemBreakdown(item: OrderItemInput): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  const breakdown = getItemPricingBreakdown(item);
  
  // Base banner cost
  if (breakdown.base_banner_cents > 0) {
    const area = item.area_sqft || (item.width_in * item.height_in) / 144;
    const unitPrice = item.unit_price_cents || 0;
    const pricePerSqFt = area > 0 ? unitPrice / (area * 100) : 0;
    
    lines.push({
      label: 'Banner cost',
      value_cents: breakdown.base_banner_cents,
      // description removed - no math equations
    });
    
    lines.push({
      label: 'Subtotal per banner',
      value_cents: item.unit_price_cents || 0,
    });
  }
  
  // Rope cost
  if (breakdown.rope_cents > 0 && item.rope_feet) {
    const mode = item.rope_pricing_mode || 'per_item';
    const multiplier = mode === 'per_item' ? item.quantity : 1;
    
    lines.push({
      label: 'Rope',
      value_cents: breakdown.rope_cents,
      description: `${item.rope_feet.toFixed(2)} ft`,
    });
  }
  
  // Pole pocket cost
  if (breakdown.pole_pocket_cents > 0) {
    const desc = formatPolePocketDescription(item);
    
    lines.push({
      label: 'Pole Pockets',
      value_cents: breakdown.pole_pocket_cents,
      description: desc || 'Setup + Linear ft',
    });
  }
  
  // Poles cost
  if (breakdown.poles_cents > 0 && item.poles_quantity) {
    const unitPrice = item.poles_unit_price_cents || 0;
    
    lines.push({
      label: 'Poles',
      value_cents: breakdown.poles_cents,
      description: `${item.poles_quantity} poles`,
    });
  }
  
  return lines;
}

/**
 * Generate order summary lines (for cart/checkout)
 */
export function generateOrderSummary(items: OrderItemInput[]): BreakdownLine[] {
  const totals = calculateOrderTotals(items);
  
  return [
    {
      label: 'Subtotal',
      value_cents: totals.subtotal_cents,
    },
    {
      label: 'Free Next-Day Air',
      value_cents: 0,
    },
    {
      label: `Tax (${(TAX_RATE * 100).toFixed(0)}%)`,
      value_cents: totals.tax_cents,
    },
    {
      label: 'Total',
      value_cents: totals.total_cents,
    },
  ];
}
