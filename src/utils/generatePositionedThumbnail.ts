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
 */
import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';

export interface PositionedThumbnailInput {
  /** Image source URL (Cloudinary; or PDF first-page browser preview URL). */
  imageUrl: string;
  /** Banner width in inches (used for aspect ratio). */
  widthIn: number;
  /** Banner height in inches (used for aspect ratio). */
  heightIn: number;
  /** Image position as percentage of the live preview container. */
  imgPosPercent: { x: number; y: number };
  /** Image scale (1 = native object-contain fit inside the container). */
  imgScale: number;
  /** Optional vertical scale for non-uniform transforms. */
  imgScaleY?: number;
  /** Background color for areas not covered by the image. */
  backgroundColor?: string;
  /** Maximum output dimension on the longer side (px). Defaults to 1200. */
  maxOutputPx?: number;
  /** Maximum total output pixels. */
  maxOutputPixels?: number;
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

const isConstrainedBrowser = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return window.matchMedia?.('(max-width: 768px)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4);
};

export function calculatePositionedOutputSize(widthIn: number, heightIn: number, maxOutputPx: number, maxOutputPixels?: number) {
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
  if (maxOutputPixels && outW * outH > maxOutputPixels) {
    const capScale = Math.sqrt(maxOutputPixels / (outW * outH));
    outW = Math.max(1, Math.floor(outW * capScale));
    outH = Math.max(1, Math.floor(outH * capScale));
  }
  return { widthPx: outW, heightPx: outH };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      fn();
    };
    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Thumbnail source image timed out while loading')));
    }, isConstrainedBrowser() ? 10_000 : 15_000);

    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => finish(() => resolve(img));
    img.onerror = () => finish(() => reject(new Error('Thumbnail source image failed to load')));
    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      finish(() => resolve(img));
    }
  });
}

async function stabilizeImageSource(src: string) {
  if (!src.startsWith('blob:') && !src.startsWith('data:')) {
    return { url: src, cleanup: () => undefined };
  }

  const response = await fetch(src);
  if (!response.ok) throw new Error(`Temporary preview could not be read (${response.status})`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('Temporary preview was empty');
  const stableUrl = URL.createObjectURL(blob);
  return {
    url: stableUrl,
    cleanup: () => URL.revokeObjectURL(stableUrl),
  };
}

/**
 * Render the positioned thumbnail to a data URL (PNG).
 * Pure-canvas, no Cloudinary call.
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
    imgScaleY,
    backgroundColor = '#fafafa',
    maxOutputPx = 1200,
    maxOutputPixels,
  } = input;
  const scaleX = imgScale;
  const scaleY = imgScaleY ?? imgScale;

  if (!imageUrl) throw new Error('generatePositionedThumbnail: imageUrl is required');
  if (!widthIn || !heightIn) throw new Error('generatePositionedThumbnail: widthIn/heightIn required');

  const constrained = isConstrainedBrowser();
  const safeMaxOutputPx = constrained ? Math.min(maxOutputPx, 2400) : maxOutputPx;
  const requestedPixelCap = maxOutputPixels ?? (constrained ? 1_500_000 : undefined);
  const safePixelCap = constrained && requestedPixelCap
    ? Math.min(requestedPixelCap, 4_000_000)
    : requestedPixelCap;

  const { widthPx: outW, heightPx: outH } = calculatePositionedOutputSize(
    widthIn,
    heightIn,
    safeMaxOutputPx,
    safePixelCap,
  );

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('generatePositionedThumbnail: could not get 2D context');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, outW, outH);

  const img = await loadImage(imageUrl);
  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;

  const fitScale = Math.min(outW / naturalW, outH / naturalH);
  const baseDrawW = naturalW * fitScale;
  const baseDrawH = naturalH * fitScale;

  const finalDrawW = baseDrawW * scaleX;
  const finalDrawH = baseDrawH * scaleY;

  const tx = (imgPosPercent.x / 100) * outW;
  const ty = (imgPosPercent.y / 100) * outH;
  const cx = outW / 2 + tx;
  const cy = outH / 2 + ty;
  const drawX = cx - finalDrawW / 2;
  const drawY = cy - finalDrawH / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, drawX, drawY, finalDrawW, finalDrawH);

  const dataUrl = canvas.toDataURL('image/png', 0.92);
  canvas.width = 0;
  canvas.height = 0;
  if (!dataUrl || dataUrl === 'data:,') throw new Error('Thumbnail canvas produced an empty image');
  return { dataUrl, widthPx: outW, heightPx: outH };
}

/**
 * Render the positioned thumbnail and upload to Cloudinary.
 * Temporary blob/data sources are copied immediately so route changes cannot
 * revoke them before a slower phone finishes the upload.
 */
export async function generatePositionedThumbnail(
  input: PositionedThumbnailInput
): Promise<PositionedThumbnailResult | null> {
  let stableSource: { url: string; cleanup: () => void } | null = null;
  try {
    stableSource = await stabilizeImageSource(input.imageUrl);
    const { dataUrl, widthPx, heightPx } = await renderPositionedThumbnailDataUrl({
      ...input,
      imageUrl: stableSource.url,
    });
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
  } finally {
    stableSource?.cleanup();
  }
}

export async function generatePositionedWebPreview(
  input: Omit<PositionedThumbnailInput, 'maxOutputPx' | 'maxOutputPixels'> & {
    maxOutputPx?: number;
    maxOutputPixels?: number;
  }
): Promise<PositionedThumbnailResult | null> {
  const constrained = isConstrainedBrowser();
  return generatePositionedThumbnail({
    ...input,
    maxOutputPx: input.maxOutputPx ?? (constrained ? 2400 : 6000),
    maxOutputPixels: input.maxOutputPixels ?? (constrained ? 4_000_000 : 24_000_000),
  });
}
