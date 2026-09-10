export type AIArtworkHelpMode = 'create' | 'fix';

const formatInches = (value: number): string => (
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
);

export function getBannerOrientation(widthIn: number, heightIn: number): 'landscape' | 'portrait' | 'square' {
  if (widthIn === heightIn) return 'square';
  return widthIn > heightIn ? 'landscape' : 'portrait';
}

export function getBannerDimensionLabel(widthIn: number, heightIn: number): string {
  return `${formatInches(widthIn)} × ${formatInches(heightIn)} inches`;
}

export function buildCreateArtworkPrompt(
  widthIn: number,
  heightIn: number,
  description = '',
): string {
  const width = formatInches(widthIn);
  const height = formatInches(heightIn);
  const idea = description.trim() || '[Describe what you want the banner to say and look like]';

  return `Create finished, print-ready artwork for a ${width} × ${height} inch vinyl banner.

The design must exactly match the ${width}:${height} shape and completely fill the canvas edge-to-edge. Do not leave white borders, white stripes, blank margins, unused space, or create a design that needs cropping.

Banner idea:
${idea}

Keep all important text, logos, faces, and other critical details safely away from the extreme edges. Make the design ${getBannerOrientation(widthIn, heightIn)} and use the highest practical resolution for large-format printing.

IMPORTANT: Give me the final finished artwork as a high-quality JPEG/JPG file. Do not give me a PNG.`;
}

export function buildFixArtworkPrompt(widthIn: number, heightIn: number): string {
  const width = formatInches(widthIn);
  const height = formatInches(heightIn);

  return `Prepare the artwork I am uploading for a ${width} × ${height} inch vinyl banner.

Recreate, resize, extend, or intelligently recompose it so the finished design exactly matches the ${width}:${height} shape and completely fills the canvas edge-to-edge. Do not leave white borders, white stripes, blank margins, or unused space.

Do not noticeably stretch or distort people, logos, text, or important objects. Intelligently extend or recompose the artwork as needed while preserving the original design and intent.

Keep important text, logos, faces, and other critical details safely away from the extreme edges. Use the highest practical resolution for large-format printing.

IMPORTANT: Give me the final corrected artwork as a high-quality JPEG/JPG file. Do not give me a PNG.`;
}

/**
 * Estimates the share of a banner canvas that would remain uncovered when the
 * entire source is shown without cropping. Small ratio differences are ignored
 * so customers only see a warning for clearly noticeable whitespace.
 */
export function getUncoveredCanvasFraction(
  bannerWidth: number,
  bannerHeight: number,
  artworkWidth: number | null | undefined,
  artworkHeight: number | null | undefined,
): number | null {
  if (![bannerWidth, bannerHeight, artworkWidth, artworkHeight].every((value) => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
  ))) return null;

  const bannerAspect = bannerWidth / bannerHeight;
  const artworkAspect = Number(artworkWidth) / Number(artworkHeight);
  const coveredFraction = Math.min(bannerAspect, artworkAspect) / Math.max(bannerAspect, artworkAspect);
  return Math.max(0, Math.min(1, 1 - coveredFraction));
}

export function shouldWarnAboutArtworkWhitespace(
  bannerWidth: number,
  bannerHeight: number,
  artworkWidth: number | null | undefined,
  artworkHeight: number | null | undefined,
  threshold = 0.12,
): boolean {
  const uncovered = getUncoveredCanvasFraction(bannerWidth, bannerHeight, artworkWidth, artworkHeight);
  return uncovered !== null && uncovered >= threshold;
}
