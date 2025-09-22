// netlify/functions/ai-finalize-banner.js
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" });
  }

  try {
    const { publicId, size, dpi = 300, textLayers, material, options } = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!publicId) {
      return json(400, { success: false, error: "Public ID is required" });
    }

    if (!size || !size.wIn || !size.hIn) {
      return json(400, { success: false, error: "Banner size is required" });
    }

    console.log(`Finalizing banner: ${publicId}, size: ${size.wIn}x${size.hIn}, DPI: ${dpi}`);

    // Calculate final dimensions with bleed
    const bleedInches = 0.25;
    const finalWidthIn = size.wIn + (bleedInches * 2);
    const finalHeightIn = size.hIn + (bleedInches * 2);
    const finalWidthPx = Math.round(finalWidthIn * dpi);
    const finalHeightPx = Math.round(finalHeightIn * dpi);

    console.log(`Final dimensions with bleed: ${finalWidthPx}x${finalHeightPx}px`);

    // Use Cloudinary transformations for processing
    const proofUrl = cloudinary.url(publicId, {
      resource_type: 'image',
      format: 'jpg',
      quality: 'auto:good',
      width: Math.min(1200, finalWidthPx),
      height: Math.min(800, finalHeightPx),
      crop: 'fit'
    });

    const finalUrl = cloudinary.url(publicId, {
      resource_type: 'image',
      format: 'png',
      quality: 'auto:best',
      width: finalWidthPx,
      height: finalHeightPx,
      crop: 'fit'
    });

    const proofPublicId = `ai-proofs/${uuidv4()}-${Date.now()}`;
    const finalPublicId = `ai-final/${uuidv4()}-${Date.now()}`;

    console.log('Finalization complete');

    return json(200, {
      success: true,
      proofUrl: proofUrl,
      finalUrl: finalUrl,
      widthPx: finalWidthPx,
      heightPx: finalHeightPx,
      dpi: dpi,
      bleedInches: bleedInches,
      proofPublicId: proofPublicId,
      finalPublicId: finalPublicId
    });

  } catch (error) {
    console.error('AI finalization error:', error);
    return json(500, {
      success: false,
      error: `Finalization failed: ${error.message}`
    });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
