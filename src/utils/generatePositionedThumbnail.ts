/**
 * Bounded exact-composition renderer.
 *
 * Physical product inches are used only to calculate aspect ratio. The canvas
 * is capped by both long edge and total pixels so a 120" product never causes
 * a 120-inch bitmap allocation on mobile Safari.
 */
import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';
import { PreviewLifecycleError } from '@/lib/previewLifecycle';

export interface PositionedThumbnailInput {
  imageUrl: string;
  widthIn: number;
  heightIn: number;
  imgPosPercent: { x: number; y: number };
  imgScale: number;
  imgScaleY?: number;
  backgroundColor?: string;
  maxOutputPx?: number;
  maxOutputPixels?: number;
}

export interface PositionedThumbnailResult {
  url: string;
  fileKey: string;
  widthPx: number;
  heightPx: number;
}

export interface PositionedPreviewBlob {
  blob: Blob;
  widthPx: number;
  heightPx: number;
  visiblePixelFraction: number;
}

const PREVIEW_MIME_TYPE = 'image/jpeg';
const PREVIEW_QUALITY = 0.88;
const DEFAULT_OUTPUT_PX = 1400;
const DEFAULT_PIXEL_CAP = 1_500_000;
const MOBILE_OUTPUT_PX = 1080;
const MOBILE_PIXEL_CAP = 1_000_000;
const RETRY_OUTPUT_PX = 720;
const RETRY_PIXEL_CAP = 600_000;
const AUDIT_EDGE_PX = 96;

const isConstrainedBrowser = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return Boolean(
    window.matchMedia?.('(max-width: 768px)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4)
  );
};

export function calculatePositionedOutputSize(
  widthIn: number,
  heightIn: number,
  maxOutputPx: number,
  maxOutputPixels?: number,
) {
  if (![widthIn, heightIn, maxOutputPx].every(Number.isFinite)
    || widthIn <= 0 || heightIn <= 0 || maxOutputPx <= 0) {
    throw new PreviewLifecycleError(
      'INVALID_PRODUCT_DIMENSIONS',
      'Preview output dimensions must be finite positive numbers.',
      { widthIn, heightIn, maxOutputPx, maxOutputPixels },
    );
  }

  const aspect = widthIn / heightIn;
  let outW = aspect >= 1 ? Math.round(maxOutputPx) : Math.round(maxOutputPx * aspect);
  let outH = aspect >= 1 ? Math.round(maxOutputPx / aspect) : Math.round(maxOutputPx);

  if (maxOutputPixels && outW * outH > maxOutputPixels) {
    const capScale = Math.sqrt(maxOutputPixels / (outW * outH));
    outW = Math.max(1, Math.floor(outW * capScale));
    outH = Math.max(1, Math.floor(outH * capScale));
  }
  return { widthPx: Math.max(1, outW), heightPx: Math.max(1, outH) };
}

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    const acceptLoadedImage = async () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        finish(() => reject(new PreviewLifecycleError(
          'SOURCE_IMAGE_DECODE_FAILED',
          'The preview source loaded without usable dimensions.',
        )));
        return;
      }
      try {
        await image.decode?.();
      } catch {
        // WebKit can reject decode after a successful onload. Valid natural
        // dimensions are the authoritative fallback in that case.
      }
      finish(() => resolve(image));
    };
    const timeoutId = window.setTimeout(() => finish(() => reject(new PreviewLifecycleError(
      'SOURCE_IMAGE_DECODE_FAILED',
      `The preview source timed out after ${timeoutMs}ms.`,
    ))), timeoutMs);

    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => { void acceptLoadedImage(); };
    image.onerror = () => finish(() => reject(new PreviewLifecycleError(
      'SOURCE_IMAGE_DECODE_FAILED',
      'The preview source failed to load.',
    )));
    image.src = src;
    if (image.complete && image.naturalWidth > 0) void acceptLoadedImage();
    window.requestAnimationFrame(() => {
      if (!settled && image.complete && image.naturalWidth > 0) void acceptLoadedImage();
    });
  });
}

function parseBackgroundRgb(color: string): [number, number, number] {
  const normalized = color.trim().toLowerCase();
  const short = normalized.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return short.slice(1).map((part) => parseInt(`${part}${part}`, 16)) as [number, number, number];
  const full = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (full) return full.slice(1).map((part) => parseInt(part, 16)) as [number, number, number];
  return [255, 255, 255];
}

export function measureVisibleArtworkFraction(
  canvas: HTMLCanvasElement,
  backgroundColor = '#ffffff',
): number {
  let audit: HTMLCanvasElement;
  try {
    audit = document.createElement('canvas');
    const aspect = canvas.width / Math.max(1, canvas.height);
    audit.width = aspect >= 1 ? AUDIT_EDGE_PX : Math.max(1, Math.round(AUDIT_EDGE_PX * aspect));
    audit.height = aspect >= 1 ? Math.max(1, Math.round(AUDIT_EDGE_PX / aspect)) : AUDIT_EDGE_PX;
  } catch (error) {
    throw new PreviewLifecycleError('CANVAS_ALLOCATION_FAILED', 'The verification canvas could not be allocated.', { error: String(error) });
  }
  const context = audit.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) {
    throw new PreviewLifecycleError('CANVAS_CONTEXT_UNAVAILABLE', 'The verification canvas has no 2D context.');
  }
  context.drawImage(canvas, 0, 0, audit.width, audit.height);
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, audit.width, audit.height).data;
  } catch (error) {
    throw new PreviewLifecycleError(
      'CANVAS_EXPORT_FAILED',
      'The rendered preview could not be inspected (the source may block canvas access).',
      { error: String(error) },
    );
  } finally {
    audit.width = 0;
    audit.height = 0;
  }

  const [backgroundR, backgroundG, backgroundB] = parseBackgroundRgb(backgroundColor);
  let visible = 0;
  const total = pixels.length / 4;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const delta = Math.abs(pixels[offset] - backgroundR)
      + Math.abs(pixels[offset + 1] - backgroundG)
      + Math.abs(pixels[offset + 2] - backgroundB);
    if (delta >= 24) visible += 1;
  }
  return total > 0 ? visible / total : 0;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob?.size) {
          reject(new PreviewLifecycleError(
            'CANVAS_EXPORT_FAILED',
            'Canvas toBlob returned an empty result.',
          ));
          return;
        }
        resolve(blob);
      }, PREVIEW_MIME_TYPE, PREVIEW_QUALITY);
    } catch (error) {
      reject(new PreviewLifecycleError(
        'CANVAS_EXPORT_FAILED',
        error instanceof Error ? error.message : String(error),
      ));
    }
  });
}

function getSafeOutputLimits(input: PositionedThumbnailInput) {
  const constrained = isConstrainedBrowser();
  const requestedLongEdge = input.maxOutputPx ?? DEFAULT_OUTPUT_PX;
  const requestedPixels = input.maxOutputPixels ?? DEFAULT_PIXEL_CAP;
  return {
    maxOutputPx: constrained ? Math.min(requestedLongEdge, MOBILE_OUTPUT_PX) : requestedLongEdge,
    maxOutputPixels: constrained ? Math.min(requestedPixels, MOBILE_PIXEL_CAP) : requestedPixels,
  };
}

export async function renderPositionedThumbnailBlob(
  input: PositionedThumbnailInput,
): Promise<PositionedPreviewBlob> {
  const {
    imageUrl,
    widthIn,
    heightIn,
    imgPosPercent,
    imgScale,
    imgScaleY,
    backgroundColor = '#ffffff',
  } = input;
  if (!imageUrl) {
    throw new PreviewLifecycleError('PERMANENT_PREVIEW_UNAVAILABLE', 'The preview source URL is empty.');
  }
  if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:image/')) {
    throw new PreviewLifecycleError('PERMANENT_PREVIEW_UNAVAILABLE', 'The preview source URL is unsupported.');
  }
  const posX = Number(imgPosPercent?.x);
  const posY = Number(imgPosPercent?.y);
  const scaleX = Number(imgScale);
  const scaleY = Number(imgScaleY ?? imgScale);
  if (![posX, posY, scaleX, scaleY].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) {
    throw new PreviewLifecycleError(
      'INVALID_ARTWORK_TRANSFORM',
      'The preview transform contains invalid values.',
      { imgPosPercent, imgScale, imgScaleY },
    );
  }

  const limits = getSafeOutputLimits(input);
  const { widthPx, heightPx } = calculatePositionedOutputSize(
    widthIn,
    heightIn,
    limits.maxOutputPx,
    limits.maxOutputPixels,
  );
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    if (canvas.width !== widthPx || canvas.height !== heightPx) throw new Error('Canvas dimensions were not retained.');
  } catch (error) {
    throw new PreviewLifecycleError(
      'CANVAS_ALLOCATION_FAILED',
      'The bounded preview canvas could not be allocated.',
      { widthPx, heightPx, error: String(error) },
    );
  }

  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new PreviewLifecycleError('CANVAS_CONTEXT_UNAVAILABLE', 'The preview canvas has no 2D context.');
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, widthPx, heightPx);

    const image = await loadImage(imageUrl, isConstrainedBrowser() ? 20_000 : 25_000);
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const containScale = Math.min(widthPx / naturalWidth, heightPx / naturalHeight);
    const drawWidth = naturalWidth * containScale * scaleX;
    const drawHeight = naturalHeight * containScale * scaleY;
    const translationX = (posX / 100) * widthPx;
    const translationY = (posY / 100) * heightPx;
    const drawX = widthPx / 2 + translationX - drawWidth / 2;
    const drawY = heightPx / 2 + translationY - drawHeight / 2;

    context.save();
    context.beginPath();
    context.rect(0, 0, widthPx, heightPx);
    context.clip();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    // This deliberately remains telemetry only. Downsampling a legitimate
    // sparse design to a 96px audit canvas can erase every artwork pixel; a
    // lossy sample must never veto the full-resolution canvas that was just
    // rendered successfully.
    let visiblePixelFraction = -1;
    try {
      visiblePixelFraction = measureVisibleArtworkFraction(canvas, backgroundColor);
    } catch (error) {
      console.warn('[placement_preview_pixel_sample_unavailable]', {
        widthPx,
        heightPx,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const blob = await canvasToBlob(canvas);
    return { blob, widthPx, heightPx, visiblePixelFraction };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new PreviewLifecycleError('CANVAS_EXPORT_FAILED', 'The preview blob could not be encoded.'));
    reader.onerror = () => reject(new PreviewLifecycleError('CANVAS_EXPORT_FAILED', 'The preview blob could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** Legacy compatibility helper. New checkout code must use the Blob path. */
export async function renderPositionedThumbnailDataUrl(input: PositionedThumbnailInput) {
  const rendered = await renderPositionedThumbnailBlob(input);
  return {
    dataUrl: await blobToDataUrl(rendered.blob),
    widthPx: rendered.widthPx,
    heightPx: rendered.heightPx,
  };
}

async function renderAndUpload(input: PositionedThumbnailInput, filePrefix: string) {
  const rendered = await renderPositionedThumbnailBlob(input);
  const uploaded = await uploadCanvasImageToCloudinary(
    rendered.blob,
    `${filePrefix}-${Date.now()}.jpg`,
  );
  return {
    url: uploaded.secureUrl,
    fileKey: uploaded.fileKey,
    widthPx: rendered.widthPx,
    heightPx: rendered.heightPx,
  };
}

/** Legacy API retained for non-checkout callers. It never returns a temporary URL. */
export async function generatePositionedThumbnail(
  input: PositionedThumbnailInput,
): Promise<PositionedThumbnailResult | null> {
  try {
    try {
      return await renderAndUpload(input, 'approved-thumbnail');
    } catch (firstError) {
      console.warn('[generatePositionedThumbnail] bounded retry', { firstError });
      return await renderAndUpload({
        ...input,
        maxOutputPx: Math.min(input.maxOutputPx ?? RETRY_OUTPUT_PX, RETRY_OUTPUT_PX),
        maxOutputPixels: Math.min(input.maxOutputPixels ?? RETRY_PIXEL_CAP, RETRY_PIXEL_CAP),
      }, 'approved-thumbnail-mobile-retry');
    }
  } catch (error) {
    console.warn('[generatePositionedThumbnail] failed', { error });
    return null;
  }
}

export async function generatePositionedWebPreview(
  input: Omit<PositionedThumbnailInput, 'maxOutputPx' | 'maxOutputPixels'> & {
    maxOutputPx?: number;
    maxOutputPixels?: number;
  },
): Promise<PositionedThumbnailResult | null> {
  return generatePositionedThumbnail({
    ...input,
    maxOutputPx: input.maxOutputPx ?? DEFAULT_OUTPUT_PX,
    maxOutputPixels: input.maxOutputPixels ?? DEFAULT_PIXEL_CAP,
  });
}
