import { getPromoDiscountSubtotalCents, resolveBestDiscount, type PromoDiscountInput } from './discount-resolver';

/** Use checkout's promotion scopes and ceiling; cart lines retain their base price. */
export function productDisplayPrice(subtotalCents: number, promo: PromoDiscountInput | null, productType: 'specialty' | 'yard_sign' | 'car_magnet' = 'specialty') {
  const promoSubtotalCents = getPromoDiscountSubtotalCents([
    { id: 'current-configurator-line', product_type: productType, width_in: 1, height_in: 1, line_total_cents: subtotalCents },
  ], subtotalCents, promo);
  const resolved = resolveBestDiscount({ subtotalCents, quantity: 1, quantitySubtotalCents: 0, promoDiscount: promo, promoSubtotalCents });
  return { totalCents: subtotalCents - resolved.appliedDiscountAmountCents,
    discountCents: resolved.appliedDiscountAmountCents,
    label: resolved.appliedDiscountAmountCents > 0 ? (promo?.code === 'NEW20' ? '20% off applied' : resolved.appliedDiscountLabel) : null };
}

export const specialtyDisplayPrice = productDisplayPrice;
