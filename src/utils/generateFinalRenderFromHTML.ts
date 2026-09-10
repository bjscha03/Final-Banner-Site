/**
 * FINAL_RENDER for HTML-based banner previews (e.g. GoogleAdsBanner).
 *
 * Unlike the Konva-based generateFinalRender.ts (used by the Design Editor),
 * this file captures the banner state from a plain HTML preview where the user
 * positions/scales an uploaded image via CSS transforms.
 *
 * The output is a high-res JPEG uploaded to Cloudinary — identical in contract
 * to what generateFinalRender.ts produces — so the admin JPEG export pipeline
 * can consume either interchangeably.
 *
 * NON-BLOCKING: All errors are caught and return null.
 */

import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';

const TARGET_DPI = 150;
const SCREEN_DPI = 96;
const JPEG_QUALITY = 0.92;
const MAX_MEGAPIXELS = 25_000_000;

export interface HTMLFinalRenderResult {
  url: string;
  fileKey: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

/**
 * Generate a pixel-perfect snapshot of the banner as the user designed it.
 *
 * @param imgSrc       URL of the uploaded image (Cloudinary or data URL)
 * @param widthIn      Banner width in inches
 * @param heightIn     Banner height in inches
 * @param imgPos       Position offset in CSS pixels {x, y} as shown on screen
 * @param imgScale     Scale factor applied by the user (1 = 100%)
 * @param containerEl  The preview container DOM element (used to read actual CSS size)
 * @param bgColor      Canvas background color (default white)
 */
export async function generateFinalRenderFromHTML(
  imgSrc: string,
  widthIn: number,
  heightIn: number,
  imgPos: { x: number; y: number },
  imgScale: number,
  containerEl: HTMLElement | null,
  bgColor = '#fafafa',
): Promise<HTMLFinalRenderResult | null> {
  try {
    console.log('[FINAL_RENDER_HTML] Starting HTML-based canvas snapshot...');
    console.log('[FINAL_RENDER_HTML] Banner dimensions:', widthIn, '×', heightIn, 'inches');
    console.log('[FINAL_RENDER_HTML] imgPos:', JSON.stringify(imgPos), 'imgScale:', imgScale);

    if (!imgSrc) {
      console.error('[FINAL_RENDER_HTML] No image source provided');
      return null;
    }

    // ----- Compute target pixel dimensions at print DPI -----
    let targetW = Math.round(widthIn * TARGET_DPI);
    let targetH = Math.round(heightIn * TARGET_DPI);
    let effectiveDpi = TARGET_DPI;

    const totalPx = targetW * targetH;
    if (totalPx > MAX_MEGAPIXELS) {
      const s = Math.sqrt(MAX_MEGAPIXELS / totalPx);
      targetW = Math.round(targetW * s);
      targetH = Math.round(targetH * s);
      effectiveDpi = Math.round(TARGET_DPI * s);
      console.warn('[FINAL_RENDER_HTML] Clamped to', (MAX_MEGAPIXELS / 1e6).toFixed(0), 'MP. Effective DPI:', effectiveDpi);
    }

    console.log('[FINAL_RENDER_HTML] Target output:', targetW, '×', targetH, 'px @', effectiveDpi, 'DPI');

    // ----- Load the source image -----
    const img = await loadImage(imgSrc);
    console.log('[FINAL_RENDER_HTML] Source image loaded:', img.naturalWidth, '×', img.naturalHeight);

    // ----- Determine CSS container size (what the user actually saw) -----
    const cssW = containerEl?.offsetWidth || (widthIn * SCREEN_DPI);
    const cssH = containerEl?.offsetHeight || (heightIn * SCREEN_DPI);
    console.log('[FINAL_RENDER_HTML] Container CSS size:', cssW, '×', cssH, 'px');

    // Ratio from CSS pixels to target print pixels
    const scaleX = targetW / cssW;
    const scaleY = targetH / cssH;

    // ----- Create offscreen canvas -----
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[FINAL_RENDER_HTML] Failed to get 2D context');
      return null;
    }

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, targetW, targetH);

    // ----- Replicate the CSS transform from GoogleAdsBanner preview -----
    // In the preview, the image wrapper div is:
    //   className="absolute inset-0 w-full h-full"
    //   style={{ transform: `translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgScale})` }}
    // Inside it the <img> has object-contain filling the wrapper.
    //
    // object-contain: image is scaled to fit inside the container while preserving
    // its aspect ratio, centred both horizontally and vertically.

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = cssW / cssH;

    // object-contain sizing within the *unscaled* wrapper (which = container size)
    let containedW: number, containedH: number;
    if (imgAspect > containerAspect) {
      // image is wider than container → width-limited
      containedW = cssW;
      containedH = cssW / imgAspect;
    } else {
      // image is taller/square → height-limited
      containedH = cssH;
      containedW = cssH * imgAspect;
    }

    // Centre within wrapper
    const offsetX = (cssW - containedW) / 2;
    const offsetY = (cssH - containedH) / 2;

    ctx.save();

    // Replicate CSS `transform: translate(x, y) scale(s)` with transform-origin center.
    // CSS applies transforms right-to-left: scale first, then translate. This means
    // the translate offset is NOT multiplied by the scale factor. In Canvas2D, each
    // call pre-multiplies the CTM, so we need: T(origin) · T(pos) · S(s) · T(-origin).
    const centreXPrint = targetW / 2;
    const centreYPrint = targetH / 2;
    ctx.translate(centreXPrint, centreYPrint);

    // Apply user translate FIRST (convert from CSS px to print px)
    ctx.translate(imgPos.x * scaleX, imgPos.y * scaleY);

    // Apply user scale SECOND (matches CSS right-to-left evaluation order)
    ctx.scale(imgScale, imgScale);

    // Move back so that (0,0) is the top-left of the wrapper in its own coordinate space
    ctx.translate(-centreXPrint, -centreYPrint);

    // Draw the image with the same object-contain layout, scaled to print
    ctx.drawImage(
      img,
      offsetX * scaleX,
      offsetY * scaleY,
      containedW * scaleX,
      containedH * scaleY,
    );

    ctx.restore();

    // ----- Export as JPEG and upload -----
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    if (!dataUrl || dataUrl.length < 100) {
      console.error('[FINAL_RENDER_HTML] Failed to generate data URL');
      return null;
    }

    console.log('[FINAL_RENDER_HTML] JPEG data URL generated, length:', dataUrl.length, 'chars');

    const fileName = `final-render-html-${Date.now()}.jpg`;
    const uploadResult = await uploadCanvasImageToCloudinary(dataUrl, fileName);

    if (!uploadResult || !uploadResult.secureUrl) {
      console.error('[FINAL_RENDER_HTML] Cloudinary upload failed');
      return null;
    }

    console.log('[FINAL_RENDER_HTML] ✅ Upload successful:', uploadResult.publicId);
    console.log('[FINAL_RENDER_HTML] URL:', uploadResult.secureUrl.substring(0, 80) + '...');

    return {
      url: uploadResult.secureUrl,
      fileKey: uploadResult.publicId || uploadResult.fileKey,
      widthPx: targetW,
      heightPx: targetH,
      dpi: effectiveDpi,
    };
  } catch (error) {
    console.error('[FINAL_RENDER_HTML] Error generating snapshot:', error);
    return null;
  }
}

// Helper: load an image and wait for it to fully decode
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Image load failed: ' + String(e)));
    img.src = src;
  });
}
