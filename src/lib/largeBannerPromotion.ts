export const LARGE_BANNER_PROMOTION_ID = 'LARGE_BANNER_25';
export const LARGE_BANNER_PROMOTION_LABEL = 'Large Banner 25% Off';
export const LARGE_BANNER_PROMOTION_PERCENTAGE = 25;
export const LARGE_BANNER_PROMOTION_RATE = LARGE_BANNER_PROMOTION_PERCENTAGE / 100;
export const LARGE_BANNER_LONG_SIDE_INCHES = 72;
export const LARGE_BANNER_SHORT_SIDE_INCHES = 36;
export const LEGACY_LARGE_BANNER_PROMO_CODE = 'BIG25';

export function isQualifyingLargeBannerDimensions(
  widthIn: number,
  heightIn: number,
  productType = 'banner',
): boolean {
  if (String(productType || '').trim().toLowerCase() !== 'banner') return false;

  const width = Number(widthIn);
  const height = Number(heightIn);
  return Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0
    && Math.max(width, height) >= LARGE_BANNER_LONG_SIDE_INCHES
    && Math.min(width, height) >= LARGE_BANNER_SHORT_SIDE_INCHES;
}

export function calculateLargeBannerDiscountCents(eligibleSubtotalCents: number): number {
  const subtotal = Number(eligibleSubtotalCents);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return Math.round(subtotal * LARGE_BANNER_PROMOTION_RATE);
}

export function isLargeBannerPromotionIdentifier(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === LARGE_BANNER_PROMOTION_ID
    || normalized === LEGACY_LARGE_BANNER_PROMO_CODE;
}
