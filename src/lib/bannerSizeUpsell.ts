import {
  calculateBannerPricing,
  type BannerPricingInput,
} from './bannerPricingEngine';
import { resolvePromo, type ResolvePromoInput } from './promoEngine';

export const BANNER_SIZE_UPSELL_TARGET = {
  widthIn: 96,
  heightIn: 48,
  presetIndex: 4,
  label: "8' × 4'",
} as const;

export type BannerSizeUpsellState = 'offer' | 'selected' | 'hidden';

export function getBannerSizeUpsellState(
  widthIn: number,
  heightIn: number,
): BannerSizeUpsellState {
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    return 'hidden';
  }

  const { widthIn: targetWidth, heightIn: targetHeight } = BANNER_SIZE_UPSELL_TARGET;
  if (widthIn === targetWidth && heightIn === targetHeight) return 'selected';

  const currentArea = widthIn * heightIn;
  const targetArea = targetWidth * targetHeight;
  const fitsRecommendedUpgrade =
    widthIn <= targetWidth
    && heightIn <= targetHeight
    && currentArea < targetArea;

  return fitsRecommendedUpgrade ? 'offer' : 'hidden';
}

export function getBannerAreaIncreasePercent(widthIn: number, heightIn: number): number {
  const currentArea = widthIn * heightIn;
  if (!Number.isFinite(currentArea) || currentArea <= 0) return 0;

  const targetArea = BANNER_SIZE_UPSELL_TARGET.widthIn * BANNER_SIZE_UPSELL_TARGET.heightIn;
  return Math.max(0, Math.round(((targetArea / currentArea) - 1) * 100));
}

function formatDimensionInFeet(inches: number): string {
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  return remainingInches > 0 ? `${feet}' ${remainingInches}"` : `${feet}'`;
}

export function formatBannerSizeInFeet(widthIn: number, heightIn: number): string {
  return `${formatDimensionInFeet(widthIn)} × ${formatDimensionInFeet(heightIn)}`;
}

export interface CalculateBannerSizeUpsellPriceInput
  extends Omit<BannerPricingInput, 'widthIn' | 'heightIn'> {
  currentSubtotalAfterDiscountCents: number;
  promoCode?: string | null;
  validatedPromo?: ResolvePromoInput['validatedPromo'];
}

/**
 * Prices the recommended 8' × 4' size with the customer's current material,
 * quantity, finishing options and validated discount. This is display-only;
 * the actual size and cart pricing still flow through the existing preset and
 * pricing handlers when the customer clicks the upgrade button.
 */
export function calculateBannerSizeUpsellPriceDifferenceCents({
  currentSubtotalAfterDiscountCents,
  promoCode,
  validatedPromo,
  ...pricingInput
}: CalculateBannerSizeUpsellPriceInput): number {
  const targetPricing = calculateBannerPricing({
    ...pricingInput,
    widthIn: BANNER_SIZE_UPSELL_TARGET.widthIn,
    heightIn: BANNER_SIZE_UPSELL_TARGET.heightIn,
  });
  const targetDiscount = resolvePromo({
    subtotalCents: targetPricing.subtotalBeforeDiscountCents,
    quantity: pricingInput.quantity,
    code: promoCode,
    validatedPromo,
  });
  const targetSubtotalAfterDiscountCents = Math.max(
    0,
    targetPricing.subtotalBeforeDiscountCents - targetDiscount.appliedDiscountAmountCents,
  );

  return Math.max(
    0,
    targetSubtotalAfterDiscountCents - Math.max(0, currentSubtotalAfterDiscountCents),
  );
}
