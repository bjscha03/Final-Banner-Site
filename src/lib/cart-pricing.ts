/**
 * Single source of truth for cart pricing calculations.
 * All UI surfaces must use computeCartTotals() to ensure consistency.
 */

import {
  getAutomaticLargeBannerSubtotalCents,
  getPromoDiscountSubtotalCents,
  resolveBestDiscount,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
} from './discount-resolver';

export type MoneyCents = number;

export type CartOption = {
  id: string;
  name: string;
  priceCents: MoneyCents;
  pricingMode: 'per_item' | 'per_order';
  quantityPerItem?: number;
};

export type CartItem = {
  id: string;
  sku: string;
  title: string;
  unitPriceCents: MoneyCents;
  qty: number;
  options: CartOption[];
  productType?: string;
  widthIn?: number;
  heightIn?: number;
};

export type Cart = {
  items: CartItem[];
  shippingCents: MoneyCents;
  taxRatePct: number;
  promoDiscount?: PromoDiscountInput | null;
};

export interface CartTotals {
  itemTotals: Array<{
    itemId: string;
    unitEachCents: MoneyCents;
    lineTotalCents: MoneyCents;
    perItemOptionsCents: MoneyCents;
    perOrderOptionsCents: MoneyCents;
  }>;
  subtotalCents: MoneyCents;
  totalQuantity: number;
  appliedDiscountType: 'quantity' | 'promo' | 'none';
  appliedDiscountCents: MoneyCents;
  appliedDiscountLabel: string;
  appliedPromotionId: string | null;
  helperMessage: string | null;
  quantityDiscountRate: number;
  quantityDiscountCents: MoneyCents;
  automaticPromotionEligible: boolean;
  automaticPromotionCents: MoneyCents;
  subtotalAfterDiscountsCents: MoneyCents;
  taxCents: MoneyCents;
  shippingCents: MoneyCents;
  totalCents: MoneyCents;
}

export const roundToCents = (n: number): MoneyCents => Math.round(n);

export const formatMoney = (cents: MoneyCents): string => `$${(cents / 100).toFixed(2)}`;

export const computeCartTotals = (cart: Cart): CartTotals => {
  const itemTotals = cart.items.map((item) => {
    const perItemOptionsCents = item.options
      .filter((option) => option.pricingMode === 'per_item')
      .reduce((sum, option) => sum + (option.priceCents * (option.quantityPerItem ?? 1)), 0);
    const perOrderOptionsCents = item.options
      .filter((option) => option.pricingMode === 'per_order')
      .reduce((sum, option) => sum + option.priceCents, 0);
    const unitEachCents = item.unitPriceCents + perItemOptionsCents;
    const lineTotalCents = (unitEachCents * item.qty) + perOrderOptionsCents;

    return {
      itemId: item.id,
      unitEachCents: roundToCents(unitEachCents),
      lineTotalCents: roundToCents(lineTotalCents),
      perItemOptionsCents: roundToCents(perItemOptionsCents),
      perOrderOptionsCents: roundToCents(perOrderOptionsCents),
    };
  });

  const subtotalCents = roundToCents(itemTotals.reduce((sum, item) => sum + item.lineTotalCents, 0));
  const totalQuantity = cart.items.reduce((sum, item) => sum + item.qty, 0);
  const bannerItems = cart.items.filter((item) => (
    String(item.productType || 'banner').trim().toLowerCase() === 'banner'
  ));
  const bannerQuantity = bannerItems.reduce((sum, item) => sum + item.qty, 0);
  const bannerItemIds = new Set(bannerItems.map((item) => item.id));
  const bannerSubtotalCents = itemTotals.reduce((sum, item) => (
    bannerItemIds.has(item.itemId) ? sum + item.lineTotalCents : sum
  ), 0);

  const promoItems: PromoDiscountCartItem[] = itemTotals.map((itemTotal) => {
    const source = cart.items.find((item) => item.id === itemTotal.itemId)!;
    return {
      id: source.id,
      product_type: source.productType || 'banner',
      width_in: Number(source.widthIn || 0),
      height_in: Number(source.heightIn || 0),
      line_total_cents: itemTotal.lineTotalCents,
    };
  });
  const automaticPromotionSubtotalCents = getAutomaticLargeBannerSubtotalCents(promoItems);
  const promoSubtotalCents = cart.promoDiscount
    ? getPromoDiscountSubtotalCents(promoItems, subtotalCents, cart.promoDiscount)
    : undefined;

  const resolved = resolveBestDiscount({
    subtotalCents,
    quantity: bannerQuantity,
    quantitySubtotalCents: bannerSubtotalCents,
    promoDiscount: cart.promoDiscount,
    promoSubtotalCents,
    automaticPromotionSubtotalCents,
  });

  const subtotalAfterDiscountsCents = roundToCents(
    Math.max(0, subtotalCents - resolved.appliedDiscountAmountCents),
  );
  const taxCents = roundToCents(subtotalAfterDiscountsCents * cart.taxRatePct / 100);
  const shippingCents = cart.shippingCents;
  const totalCents = roundToCents(subtotalAfterDiscountsCents + taxCents + shippingCents);

  return {
    itemTotals,
    subtotalCents,
    totalQuantity,
    appliedDiscountType: resolved.appliedDiscountType,
    appliedDiscountCents: resolved.appliedDiscountAmountCents,
    appliedDiscountLabel: resolved.appliedDiscountLabel,
    appliedPromotionId: resolved.appliedPromotionId,
    helperMessage: resolved.helperMessage,
    quantityDiscountRate: resolved.quantityDiscountRate,
    quantityDiscountCents: resolved.quantityDiscountAmountCents,
    automaticPromotionEligible: resolved.automaticPromotionEligible,
    automaticPromotionCents: resolved.automaticPromotionAmountCents,
    subtotalAfterDiscountsCents,
    taxCents,
    shippingCents,
    totalCents,
  };
};
