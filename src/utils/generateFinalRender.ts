// FINAL_RENDER: Generate high-resolution canvas snapshot as JPEG for print vendors.
// CHANGED (2026-03-01): Switched from PNG@150 DPI to JPEG@300 DPI per vendor requirements.
// NON-BLOCKING: All errors are caught and return null instead of throwing.
// CRITICAL: Captures ONLY the banner area (no margins/rulers) - matching customer preview exactly.

import Konva from 'konva';
import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';

// CHANGED: 150 -> 300 DPI for print-grade JPEG output
const TARGET_DPI = 300;
const PIXELS_PER_INCH = 96; // Screen DPI - matches EditorCanvas.tsx

// JPEG quality 0.92 balances file size vs. print quality
const JPEG_QUALITY = 0.92;

// Safety cap: 200 megapixels max to avoid browser crashes on huge banners
const MAX_MEGAPIXELS = 200_000_000;

export interface FinalRenderResult {
  url: string;
  fileKey: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

export async function generateFinalRender(
  stage: Konva.Stage,
  widthIn: number,
  heightIn: number
): Promise<FinalRenderResult | null> {
  try {
    console.log('[FINAL_RENDER] Starting high-resolution JPEG snapshot...');
    console.log('[FINAL_RENDER] Banner dimensions:', widthIn, 'x', heightIn, 'inches');

    // Get the layer
    const layer = stage.getLayers()[0];
    if (!layer) {
      console.error('[FINAL_RENDER] No layer found');
      return null;
    }

    // Hide transformer, guides, and other non-printable elements before capture
    const bleedNode = layer.findOne('.bleed-guide');
    const safezoneNode = layer.findOne('.safezone-guide');
    const gridNode = layer.findOne('.grid-guide');
    const grommetNode = layer.findOne('.grommet-guide');
    const transformerNode = layer.findOne('Transformer');

    // Store original visibility
    const bleedWasVisible = bleedNode?.visible() ?? false;
    const safezoneWasVisible = safezoneNode?.visible() ?? false;
    const gridWasVisible = gridNode?.visible() ?? false;
    const grommetWasVisible = grommetNode?.visible() ?? false;
    const transformerWasVisible = transformerNode?.visible() ?? false;

    // Hide non-printable elements
    bleedNode?.visible(false);
    safezoneNode?.visible(false);
    gridNode?.visible(false);
    grommetNode?.visible(false);
    transformerNode?.visible(false);

    // Force immediate redraw
    layer.batchDraw();

    // Wait a frame for the redraw to complete
    await new Promise(resolve => requestAnimationFrame(resolve));

    // The first child of the layer is the background rect (canvas area)
    const backgroundRect = layer.getChildren()[0];
    if (!backgroundRect) {
      console.error('[FINAL_RENDER] No background rect found');
      // Restore visibility
      bleedNode?.visible(bleedWasVisible);
      safezoneNode?.visible(safezoneWasVisible);
      gridNode?.visible(gridWasVisible);
      grommetNode?.visible(grommetWasVisible);
      transformerNode?.visible(transformerWasVisible);
      layer.batchDraw();
      return null;
    }

    // Get the position and SCALED size of the banner area on screen
    const x = backgroundRect.x();
    const y = backgroundRect.y();
    const scaledWidth = backgroundRect.width();
    const scaledHeight = backgroundRect.height();

    // Calculate the actual banner dimensions in pixels at screen DPI
    const fullWidthPx = widthIn * PIXELS_PER_INCH;
    const fullHeightPx = heightIn * PIXELS_PER_INCH;

    // Calculate the current scale factor (how much the canvas is scaled down to fit screen)
    const currentScale = scaledWidth / fullWidthPx;

    console.log('[FINAL_RENDER] Scaled bounds on screen:', { x, y, width: scaledWidth, height: scaledHeight });
    console.log('[FINAL_RENDER] Current display scale:', currentScale);
    console.log('[FINAL_RENDER] Full size at 96 DPI:', fullWidthPx, 'x', fullHeightPx, 'px');

    // Calculate target output dimensions at print DPI
    let targetWidthPx = Math.round(widthIn * TARGET_DPI);
    let targetHeightPx = Math.round(heightIn * TARGET_DPI);

    // SAFETY CAP: Clamp to MAX_MEGAPIXELS to prevent browser tab crash on very large banners
    const totalPixels = targetWidthPx * targetHeightPx;
    let effectiveDpi = TARGET_DPI;
    if (totalPixels > MAX_MEGAPIXELS) {
      const scaleFactor = Math.sqrt(MAX_MEGAPIXELS / totalPixels);
      targetWidthPx = Math.round(targetWidthPx * scaleFactor);
      targetHeightPx = Math.round(targetHeightPx * scaleFactor);
      effectiveDpi = Math.round(TARGET_DPI * scaleFactor);
      console.warn('[FINAL_RENDER] Output clamped to', MAX_MEGAPIXELS / 1e6, 'MP. Effective DPI:', effectiveDpi);
    }

    // Calculate the pixelRatio needed to achieve target DPI output
    // We need to account for the current scale of the canvas
    // pixelRatio = (targetDPI / screenDPI) / currentScale
    // This gives us the correct upscale factor to achieve print resolution
    const pixelRatio = (effectiveDpi / PIXELS_PER_INCH) / currentScale;

    console.log('[FINAL_RENDER] Target output:', targetWidthPx, 'x', targetHeightPx, 'px at', effectiveDpi, 'DPI');
    console.log('[FINAL_RENDER] Using pixelRatio:', pixelRatio.toFixed(4));

    // CRITICAL: Capture ONLY the banner area using x, y, width, height
    // The pixelRatio accounts for both the current scale AND the DPI upscale
    const dataUrl = stage.toDataURL({
      x: x,
      y: y,
      width: scaledWidth,
      height: scaledHeight,
      pixelRatio: pixelRatio,
      // CHANGED: mimeType from image/png to image/jpeg for vendor requirements
      mimeType: 'image/jpeg',
      quality: JPEG_QUALITY
    });

    // Restore visibility of hidden elements
    bleedNode?.visible(bleedWasVisible);
    safezoneNode?.visible(safezoneWasVisible);
    gridNode?.visible(gridWasVisible);
    grommetNode?.visible(grommetWasVisible);
    transformerNode?.visible(transformerWasVisible);
    layer.batchDraw();

    if (!dataUrl || dataUrl.length < 100) {
      console.error('[FINAL_RENDER] Failed to generate data URL');
      return null;
    }

    console.log('[FINAL_RENDER] JPEG data URL generated successfully, length:', dataUrl.length, 'chars');

    // Upload with a unique filename for final renders
    const fileName = `final-render-${Date.now()}.jpg`;
    const uploadResult = await uploadCanvasImageToCloudinary(dataUrl, fileName);

    if (!uploadResult || !uploadResult.secureUrl) {
      console.error('[FINAL_RENDER] Cloudinary upload failed');
      return null;
    }

    console.log('[FINAL_RENDER] ✅ Upload successful:', uploadResult.publicId);
    console.log('[FINAL_RENDER] URL:', uploadResult.secureUrl.substring(0, 80) + '...');

    return {
      url: uploadResult.secureUrl,
      fileKey: uploadResult.publicId || uploadResult.fileKey,
      widthPx: targetWidthPx,
      heightPx: targetHeightPx,
      dpi: effectiveDpi
    };
  } catch (error) {
    console.error('[FINAL_RENDER] Error generating snapshot:', error);
    return null;
  }
}
