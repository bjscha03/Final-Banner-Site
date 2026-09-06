import {
  getPromoDiscountSubtotalCents,
  isQualifyingLargeBannerDiscountItem,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
  type ResolvedDiscount,
} from './discount-resolver';
import { LARGE_BANNER_PROMOTION_ID } from './largeBannerPromotion';

/** Allocate the resolved discount for display only; never change stored/payment prices.
 * Cumulative rounding keeps all displayed lines equal to the cart total. */
export function getCartDisplayPrices(
  items: PromoDiscountCartItem[],
  resolved: ResolvedDiscount,
  promo?: PromoDiscountInput | null,
): Map<string, { originalCents: number; discountCents: number; totalCents: number }> {
  const weights = items.map(item => {
    if (resolved.appliedDiscountType === 'none') return 0;
    if (resolved.appliedDiscountType === 'quantity') {
      return !['yard_sign', 'car_magnet'].includes(item.product_type || 'banner') ? item.line_total_cents : 0;
    }
    if (resolved.promotionId === LARGE_BANNER_PROMOTION_ID) {
      return isQualifyingLargeBannerDiscountItem({ ...item, product_type: item.product_type || 'banner' }) ? item.line_total_cents : 0;
    }
    return promo ? getPromoDiscountSubtotalCents([item], item.line_total_cents, promo) : 0;
  });
  const base = weights.reduce((sum, value) => sum + value, 0);
  const discount = Math.min(base, Math.max(0, resolved.appliedDiscountAmountCents));
  let cumulative = 0;
  let allocated = 0;
  return new Map(items.map((item, index) => {
    cumulative += weights[index];
    const next = base > 0 ? Math.round(cumulative * discount / base) : 0;
    const discountCents = next - allocated;
    allocated = next;
    return [item.id, { originalCents: item.line_total_cents, discountCents, totalCents: item.line_total_cents - discountCents }];
  }));
}

export function getEnteredPromoLabel(promo: PromoDiscountInput, resolved: ResolvedDiscount): string {
  const applied = resolved.appliedDiscountType === 'promo'
    && resolved.promotionId !== LARGE_BANNER_PROMOTION_ID
    && resolved.promoDiscountCode?.toUpperCase() === promo.code.toUpperCase()
    && resolved.appliedDiscountAmountCents > 0;
  return applied
    ? `${resolved.appliedDiscountLabel} applied`
    : `${promo.code} not applied — ${resolved.appliedDiscountAmountCents > 0 ? `${resolved.appliedDiscountLabel} applied instead` : 'no eligible items in this cart'}`;
}
