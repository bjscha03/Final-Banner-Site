/**
 * generatePositionedThumbnail
 *
 * Single source of truth for the cart/checkout/admin thumbnail.
 *
 * Composites the user's uploaded artwork onto a canvas that matches the banner
 * aspect ratio (widthIn x heightIn), applying the same object-contain layout
 * plus translate(imgPos)/scale(imgScale) used by the live builder preview, on
 * a neutral background. The resulting data URL is uploaded to Cloudinary so
 * cart/checkout/admin can all reference the same baked-in approved image.
 *
 * The math here mirrors the live preview in:
 *   - src/pages/Design.tsx (previewContainerRef + transform: translate(...) scale(...))
 *   - src/pages/GoogleAdsBanner.tsx (same)
 *
 * Image position is stored in PERCENT of the live container (containerCssWidth/
 * containerCssHeight). We re-derive draw rect at any output size from those
 * percents so the thumbnail looks identical regardless of the user's window
 * size at Add-to-Cart time.
 */
import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';

export interface PositionedThumbnailInput {
  /** Image source URL (Cloudinary; or PDF first-page jpg URL for PDFs). */
  imageUrl: string;
  /** Banner width in inches (used for aspect ratio). */
  widthIn: number;
  /** Banner height in inches (used for aspect ratio). */
  heightIn: number;
  /** Image position as percentage of the live preview container, e.g. { x: -12.5, y: 7.2 }. */
  imgPosPercent: { x: number; y: number };
  /** Image scale (1 = native object-contain fit inside the container). */
  imgScale: number;
  /** Background color for areas not covered by the image (neutral). */
  backgroundColor?: string;
  /** Maximum output dimension on the longer side (px). Defaults to 1200. */
  maxOutputPx?: number;
}

export interface PositionedThumbnailResult {
  /** Public Cloudinary URL for the baked thumbnail. */
  url: string;
  /** Cloudinary file key. */
  fileKey: string;
  /** Output width in pixels. */
  widthPx: number;
  /** Output height in pixels. */
  heightPx: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Render the positioned thumbnail to a data URL (PNG).
 * Pure-canvas, no Cloudinary call. Useful for tests and when an upload is
 * not desired.
 */
export async function renderPositionedThumbnailDataUrl(
  input: PositionedThumbnailInput
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const {
    imageUrl,
    widthIn,
    heightIn,
    imgPosPercent,
    imgScale,
    backgroundColor = '#fafafa',
    maxOutputPx = 1200,
  } = input;

  if (!imageUrl) throw new Error('generatePositionedThumbnail: imageUrl is required');
  if (!widthIn || !heightIn) throw new Error('generatePositionedThumbnail: widthIn/heightIn required');

  // Output canvas dimensions match banner aspect ratio.
  const aspect = widthIn / heightIn;
  let outW: number;
  let outH: number;
  if (aspect >= 1) {
    outW = maxOutputPx;
    outH = Math.round(maxOutputPx / aspect);
  } else {
    outH = maxOutputPx;
    outW = Math.round(maxOutputPx * aspect);
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('generatePositionedThumbnail: could not get 2D context');

  // Neutral background.
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, outW, outH);

  let img: HTMLImageElement;
  try {
    img = await loadImage(imageUrl);
  } catch (err) {
    // If image fails to load (e.g., CORS), return the background-only canvas.
    console.warn('[generatePositionedThumbnail] image load failed, returning background only:', err);
    return { dataUrl: canvas.toDataURL('image/png'), widthPx: outW, heightPx: outH };
  }

  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;

  // Replicate the preview's "object-contain" sizing inside the container,
  // then apply the user's translate/scale (transform-origin: center center).
  // Step 1: object-contain rect at scale=1, no translation.
  const fitScale = Math.min(outW / naturalW, outH / naturalH);
  const baseDrawW = naturalW * fitScale;
  const baseDrawH = naturalH * fitScale;

  // Step 2: apply user scale around the container's center.
  const finalDrawW = baseDrawW * imgScale;
  const finalDrawH = baseDrawH * imgScale;

  // Step 3: apply user translate (percent of container -> pixels of output).
  const tx = (imgPosPercent.x / 100) * outW;
  const ty = (imgPosPercent.y / 100) * outH;

  const cx = outW / 2 + tx;
  const cy = outH / 2 + ty;

  const drawX = cx - finalDrawW / 2;
  const drawY = cy - finalDrawH / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, drawX, drawY, finalDrawW, finalDrawH);

  return { dataUrl: canvas.toDataURL('image/png'), widthPx: outW, heightPx: outH };
}

/**
 * Render the positioned thumbnail and upload to Cloudinary. Returns the
 * permanent Cloudinary URL to store as the cart item's `thumbnail_url`.
 *
 * If anything fails (image CORS, upload error, etc.), this returns null and
 * the caller can fall back to whatever it stored previously. We never throw —
 * thumbnail generation must never block "Add to Cart".
 */
export async function generatePositionedThumbnail(
  input: PositionedThumbnailInput
): Promise<PositionedThumbnailResult | null> {
  try {
    const { dataUrl, widthPx, heightPx } = await renderPositionedThumbnailDataUrl(input);
    const upload = await uploadCanvasImageToCloudinary(
      dataUrl,
      `approved-thumbnail-${Date.now()}.png`
    );
    return {
      url: upload.secureUrl,
      fileKey: upload.fileKey,
      widthPx,
      heightPx,
    };
  } catch (err) {
    console.warn('[generatePositionedThumbnail] failed:', err);
    return null;
  }
}
