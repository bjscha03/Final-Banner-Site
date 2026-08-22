type BannerSizeCommitInput = {
  productType: string;
  widthIn: number;
  heightIn: number;
  hasArtwork: boolean;
};

/**
 * Uploading artwork is an explicit commitment to the banner dimensions that
 * are already visible in the builder. This keeps the initial $0 state until
 * the customer either chooses a size or uploads artwork, while preventing a
 * valid uploaded banner from being stranded behind a hidden confirmation flag.
 */
export function shouldAutoConfirmBannerSize({
  productType,
  widthIn,
  heightIn,
  hasArtwork,
}: BannerSizeCommitInput): boolean {
  return productType === 'banner'
    && hasArtwork
    && Number.isFinite(widthIn)
    && widthIn > 0
    && Number.isFinite(heightIn)
    && heightIn > 0;
}
