/**
 * generatePositionedThumbnail
 *
 * Single source of truth for the cart/checkout/admin thumbnail.
 *
 * Composites the customer's uploaded artwork onto an opaque canvas matching the
 * product aspect ratio and applies the same position/scale values used by the
 * live preview. The result is uploaded to Cloudinary so every later screen can
 * use a permanent URL instead of a browser-only blob or data URL.
 */
import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';

export interface PositionedThumbnailInput {
  /** Image source URL (Cloudinary, a browser preview URL, or a data URL). */
  imageUrl: string;
  /** Product width in inches, used only for aspect ratio. */
  widthIn: number;
  /** Product height in inches, used only for aspect ratio. */
  heightIn: number;
  /** Image position as a percentage of the live preview container. */
  imgPosPercent: { x: number; y: number };
  /** Horizontal image scale. */
  imgScale: number;
  /** Optional vertical scale for non-uniform transforms. */
  imgScaleY?: number;
  /** Background color for uncovered areas. */
  backgroundColor?: string;
  /** Maximum output dimension on the longer side. Defaults to 1200px. */
  maxOutputPx?: number;
  /** Maximum total output pixels. */
  maxOutputPixels?: number;
}

export interface PositionedThumbnailResult {
  url: string;
  fileKey: string;
  widthPx: number;
  heightPx: number;
}

const THUMBNAIL_MIME_TYPE = 'image/jpeg';
const THUMBNAIL_QUALITY = 0.88;
const DEFAULT_OUTPUT_PX = 1200;
const MOBILE_OUTPUT_PX = 960;
const MOBILE_PIXEL_CAP = 1_000_000;
const RETRY_OUTPUT_PX = 720;
const RETRY_PIXEL_CAP = 600_000;

const isConstrainedBrowser = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return Boolean(
    window.matchMedia?.('(max-width: 768px)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4),
  );
};

export function calculatePositionedOutputSize(
  widthIn: number,
  heightIn: number,
  maxOutputPx: number,
  maxOutputPixels?: number,
) {
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

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = window.setTimeout(
      () => finish(() => reject(new Error('Thumbnail source image timed out while loading'))),
      isConstrainedBrowser() ? 12_000 : 18_000,
    );

    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => finish(() => resolve(img));
    img.onerror = () => finish(() => reject(new Error('Thumbnail source image failed to load')));
    img.src = src;

    // Cached images can complete before the load handler runs on iOS Safari.
    if (img.complete && img.naturalWidth > 0) finish(() => resolve(img));
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

function getSafeOutputLimits(input: PositionedThumbnailInput) {
  const constrained = isConstrainedBrowser();
  const requestedMax = input.maxOutputPx ?? DEFAULT_OUTPUT_PX;
  const safeMaxOutputPx = constrained
    ? Math.min(requestedMax, MOBILE_OUTPUT_PX)
    : requestedMax;

  const requestedPixelCap = input.maxOutputPixels;
  const safePixelCap = constrained
    ? Math.min(requestedPixelCap ?? MOBILE_PIXEL_CAP, MOBILE_PIXEL_CAP)
    : requestedPixelCap;

  return { safeMaxOutputPx, safePixelCap };
}

/**
 * Render the positioned thumbnail to a compact JPEG data URL.
 *
 * The preview canvas is always opaque, so PNG provided no visual benefit while
 * producing multi-megabyte strings that could exceed mobile Safari storage and
 * memory limits. JPEG keeps the immediate cart preview fast; the original
 * artwork remains untouched for production.
 */
export async function renderPositionedThumbnailDataUrl(
  input: PositionedThumbnailInput,
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const {
    imageUrl,
    widthIn,
    heightIn,
    imgPosPercent,
    imgScale,
    imgScaleY,
    backgroundColor = '#fafafa',
  } = input;

  if (!imageUrl) throw new Error('generatePositionedThumbnail: imageUrl is required');
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    throw new Error('generatePositionedThumbnail: valid widthIn/heightIn are required');
  }

  const { safeMaxOutputPx, safePixelCap } = getSafeOutputLimits(input);
  const { widthPx: outW, heightPx: outH } = calculatePositionedOutputSize(
    widthIn,
    heightIn,
    safeMaxOutputPx,
    safePixelCap,
  );

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  try {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('generatePositionedThumbnail: could not get 2D context');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, outW, outH);

    const img = await loadImage(imageUrl);
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const fitScale = Math.min(outW / naturalW, outH / naturalH);
    const scaleX = Number.isFinite(imgScale) && imgScale > 0 ? imgScale : 1;
    const scaleYCandidate = imgScaleY ?? scaleX;
    const scaleY = Number.isFinite(scaleYCandidate) && scaleYCandidate > 0 ? scaleYCandidate : scaleX;
    const finalDrawW = naturalW * fitScale * scaleX;
    const finalDrawH = naturalH * fitScale * scaleY;
    const tx = ((Number.isFinite(imgPosPercent?.x) ? imgPosPercent.x : 0) / 100) * outW;
    const ty = ((Number.isFinite(imgPosPercent?.y) ? imgPosPercent.y : 0) / 100) * outH;
    const drawX = outW / 2 + tx - finalDrawW / 2;
    const drawY = outH / 2 + ty - finalDrawH / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, finalDrawW, finalDrawH);

    const dataUrl = canvas.toDataURL(THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY);
    if (!dataUrl || dataUrl === 'data:,') throw new Error('Thumbnail canvas produced an empty image');

    return { dataUrl, widthPx: outW, heightPx: outH };
  } finally {
    // Release the backing store immediately; this matters on lower-memory phones.
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function renderAndUpload(
  input: PositionedThumbnailInput,
  filePrefix: string,
): Promise<PositionedThumbnailResult> {
  const { dataUrl, widthPx, heightPx } = await renderPositionedThumbnailDataUrl(input);
  const upload = await uploadCanvasImageToCloudinary(
    dataUrl,
    `${filePrefix}-${Date.now()}.jpg`,
  );

  return {
    url: upload.secureUrl,
    fileKey: upload.fileKey,
    widthPx,
    heightPx,
  };
}

/**
 * Render and upload the compact positioned thumbnail.
 *
 * A smaller second attempt is made when the first upload fails. This primarily
 * protects customers on slow cellular connections and memory-constrained iOS
 * browsers without blocking checkout or changing the print-ready artwork.
 */
export async function generatePositionedThumbnail(
  input: PositionedThumbnailInput,
): Promise<PositionedThumbnailResult | null> {
  let stableSource: { url: string; cleanup: () => void } | null = null;

  try {
    stableSource = await stabilizeImageSource(input.imageUrl);
    const stableInput = { ...input, imageUrl: stableSource.url };

    try {
      return await renderAndUpload(stableInput, 'approved-thumbnail');
    } catch (firstError) {
      console.warn('[generatePositionedThumbnail] first attempt failed; retrying smaller:', firstError);
      return await renderAndUpload({
        ...stableInput,
        maxOutputPx: Math.min(input.maxOutputPx ?? RETRY_OUTPUT_PX, RETRY_OUTPUT_PX),
        maxOutputPixels: Math.min(input.maxOutputPixels ?? RETRY_PIXEL_CAP, RETRY_PIXEL_CAP),
      }, 'approved-thumbnail-mobile-retry');
    }
  } catch (error) {
    console.warn('[generatePositionedThumbnail] failed:', error);
    return null;
  } finally {
    stableSource?.cleanup();
  }
}

export async function generatePositionedWebPreview(
  input: Omit<PositionedThumbnailInput, 'maxOutputPx' | 'maxOutputPixels'> & {
    maxOutputPx?: number;
    maxOutputPixels?: number;
  },
): Promise<PositionedThumbnailResult | null> {
  const constrained = isConstrainedBrowser();
  return generatePositionedThumbnail({
    ...input,
    maxOutputPx: input.maxOutputPx ?? (constrained ? 1600 : 3200),
    maxOutputPixels: input.maxOutputPixels ?? (constrained ? 2_500_000 : 10_000_000),
  });
}
