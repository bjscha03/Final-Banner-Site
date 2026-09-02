export const POPULAR_BANNER_PRESET = {
  widthIn: 72,
  heightIn: 36,
  presetIndex: 2,
  mobilePriceNote: "Most popular size: 6′ × 3′",
} as const;

export function isPopularBannerPreset(
  productType: string,
  widthIn: number,
  heightIn: number,
  activePreset: number | null,
): boolean {
  return productType === 'banner'
    && activePreset === POPULAR_BANNER_PRESET.presetIndex
    && widthIn === POPULAR_BANNER_PRESET.widthIn
    && heightIn === POPULAR_BANNER_PRESET.heightIn;
}
