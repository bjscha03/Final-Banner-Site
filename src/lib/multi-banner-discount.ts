/**
 * Multi-Banner Discount Logic
 * Single source of truth for calculating discounts when ordering multiple banners.
 *
 * Rule: 5% off each additional banner beyond the first.
 */

export const MULTI_BANNER_DISCOUNT_RATE = 0.05;

export function calculateMultiBannerDiscountCents(
  items: { line_total_cents: number }[]
): number {
  if (!items || items.length <= 1) return 0;
  const sortedItems = [...items].sort((a, b) => b.line_total_cents - a.line_total_cents);
  let discountCents = 0;
  for (let i = 1; i < sortedItems.length; i++) {
    discountCents += Math.round(sortedItems[i].line_total_cents * MULTI_BANNER_DISCOUNT_RATE);
  }
  return discountCents;
}

export function getMultiBannerDiscountMessage(itemCount: number): string | null {
  if (itemCount <= 1) return null;
  const discountedCount = itemCount - 1;
  return `5% off ${discountedCount} banner${discountedCount > 1 ? 's' : ''} (multi-banner discount)`;
}

export function calculateQuickQuoteDiscountCents(
  unitPriceCents: number,
  quantity: number
): number {
  if (quantity <= 1) return 0;
  const discountedBanners = quantity - 1;
  return Math.round(unitPriceCents * MULTI_BANNER_DISCOUNT_RATE * discountedBanners);
}

export function getMultiBannerPromoMessage(): string {
  return '5% off each additional banner!';
}
