// FINAL_RENDER: Generate high-resolution canvas snapshot for admin PDF
// NON-BLOCKING: All errors are caught and return null instead of throwing.
// CRITICAL: Captures ONLY the banner area (no margins/rulers) - matching customer preview exactly.

import Konva from 'konva';
import { uploadCanvasImageToCloudinary } from './uploadCanvasImage';

const TARGET_DPI = 150;
const SCREEN_DPI = 96;

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
    console.log('[FINAL_RENDER] Starting high-resolution snapshot...');
    
    // Get the layer and background rect to find the exact banner bounds
    // This matches how generateThumbnail works in BannerEditorLayout.tsx
    const layer = stage.getLayers()[0];
    if (!layer) {
      console.error('[FINAL_RENDER] No layer found');
      return null;
    }
    
    // The first child of the layer is the background rect (canvas area)
    const backgroundRect = layer.getChildren()[0];
    if (!backgroundRect) {
      console.error('[FINAL_RENDER] No background rect found');
      return null;
    }
    
    // Get the actual position and size of the banner area
    const x = backgroundRect.x();
    const y = backgroundRect.y();
    const canvasWidth = backgroundRect.width();
    const canvasHeight = backgroundRect.height();
    
    console.log('[FINAL_RENDER] Banner bounds:', { x, y, width: canvasWidth, height: canvasHeight });
    
    // Calculate pixelRatio to achieve target DPI
    // The canvas renders at screen DPI, we want to upscale for print
    const pixelRatio = TARGET_DPI / SCREEN_DPI;
    const widthPx = Math.round(widthIn * TARGET_DPI);
    const heightPx = Math.round(heightIn * TARGET_DPI);

    // CRITICAL FIX: Capture ONLY the banner area using x, y, width, height
    // This ensures the PDF matches exactly what the customer designed
    const dataUrl = stage.toDataURL({
      x: x,
      y: y,
      width: canvasWidth,
      height: canvasHeight,
      pixelRatio: pixelRatio,
      mimeType: 'image/png',
      quality: 1
    });

    if (!dataUrl || dataUrl.length < 100) {
      console.error('[FINAL_RENDER] Failed to generate data URL');
      return null;
    }

    console.log('[FINAL_RENDER] Data URL generated, length:', dataUrl.length);

    // Upload with a unique filename for final renders
    const fileName = `final-render-${Date.now()}.png`;
    const uploadResult = await uploadCanvasImageToCloudinary(dataUrl, fileName);

    if (!uploadResult || !uploadResult.secureUrl) {
      console.error('[FINAL_RENDER] Cloudinary upload failed');
      return null;
    }

    console.log('[FINAL_RENDER] Upload successful:', uploadResult.publicId);

    return {
      url: uploadResult.secureUrl,
      fileKey: uploadResult.publicId || uploadResult.fileKey,
      widthPx,
      heightPx,
      dpi: TARGET_DPI
    };
  } catch (error) {
    console.error('[FINAL_RENDER] Error generating snapshot:', error);
    return null;
  }
}
