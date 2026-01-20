// FINAL_RENDER: Generate high-resolution canvas snapshot for admin PDF
// NON-BLOCKING: All errors are caught and return null instead of throwing.

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
    const pixelRatio = TARGET_DPI / SCREEN_DPI;
    const widthPx = Math.round(widthIn * TARGET_DPI);
    const heightPx = Math.round(heightIn * TARGET_DPI);

    const dataUrl = stage.toDataURL({
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
