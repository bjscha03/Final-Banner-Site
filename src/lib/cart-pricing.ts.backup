/**
 * Single source of truth for cart pricing calculations
 * All UI surfaces must use computeCartTotals() to ensure consistency
 */

// Core types for the new pricing system
export type MoneyCents = number; // integer cents

export type CartOption = {
  id: string;
  name: string;
  priceCents: MoneyCents;      // price *before* quantity
  pricingMode: 'per_item' | 'per_order'; // REQUIRED
  quantityPerItem?: number;    // e.g., 4 ft of rope per banner (default 1)
};

export type CartItem = {
  id: string;
  sku: string;
  title: string;               // e.g., "Custom Banner 48\" x 24\""
  unitPriceCents: MoneyCents;  // base banner price per item
  qty: number;
  options: CartOption[];
};

export type Cart = {
  items: CartItem[];
  shippingCents: MoneyCents;   // 0 when FREE
  taxRatePct: number;          // e.g., 6 for 6%
  discountsCents?: MoneyCents; // sum of applied discounts (positive number)
};

// Computed totals interface
export interface CartTotals {
  // Per-item calculations
  itemTotals: Array<{
    itemId: string;
    unitEachCents: MoneyCents;     // unit price + per-item options
    lineTotalCents: MoneyCents;    // (unitEach * qty) + per-order options
    perItemOptionsCents: MoneyCents;
    perOrderOptionsCents: MoneyCents;
  }>;
  
  // Cart-level totals
  subtotalCents: MoneyCents;     // sum of all line totals
  discountsCents: MoneyCents;    // applied discounts
  subtotalAfterDiscountsCents: MoneyCents; // subtotal - discounts
  taxCents: MoneyCents;          // tax on subtotal after discounts
  shippingCents: MoneyCents;     // shipping cost
  totalCents: MoneyCents;        // final total
}

/**
 * Utility function to round to nearest cent
 */
export const roundToCents = (n: number): MoneyCents => Math.round(n);

/**
 * Format money from cents to currency string
 */
export const formatMoney = (cents: MoneyCents): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

/**
 * Single source of truth for cart pricing calculations
 * This function must be used by ALL UI surfaces to ensure consistency
 */
export const computeCartTotals = (cart: Cart): CartTotals => {
  const itemTotals = cart.items.map(item => {
    // Calculate per-item options total
    const perItemOptionsCents = item.options
      .filter(option => option.pricingMode === 'per_item')
      .reduce((sum, option) => {
        const quantityPerItem = option.quantityPerItem ?? 1;
        return sum + (option.priceCents * quantityPerItem);
      }, 0);

    // Calculate per-order options total
    const perOrderOptionsCents = item.options
      .filter(option => option.pricingMode === 'per_order')
      .reduce((sum, option) => sum + option.priceCents, 0);

    // Unit price including per-item options
    const unitEachCents = item.unitPriceCents + perItemOptionsCents;

    // Line total: (unit + per-item options) * qty + per-order options
    const lineTotalCents = (unitEachCents * item.qty) + perOrderOptionsCents;

    return {
      itemId: item.id,
      unitEachCents: roundToCents(unitEachCents),
      lineTotalCents: roundToCents(lineTotalCents),
      perItemOptionsCents: roundToCents(perItemOptionsCents),
      perOrderOptionsCents: roundToCents(perOrderOptionsCents),
    };
  });

  // Calculate cart totals
  const subtotalCents = roundToCents(
    itemTotals.reduce((sum, item) => sum + item.lineTotalCents, 0)
  );

  const discountsCents = cart.discountsCents ?? 0;
  const subtotalAfterDiscountsCents = roundToCents(subtotalCents - discountsCents);

  // Tax is calculated on subtotal after discounts
  const taxCents = roundToCents(subtotalAfterDiscountsCents * cart.taxRatePct / 100);

  const shippingCents = cart.shippingCents;
  const totalCents = roundToCents(subtotalAfterDiscountsCents + taxCents + shippingCents);

  return {
    itemTotals,
    subtotalCents,
    discountsCents,
    subtotalAfterDiscountsCents,
    taxCents,
    shippingCents,
    totalCents,
  };
};
