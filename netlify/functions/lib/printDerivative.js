/**
 * Print Derivative Generation
 * 
 * Generates high-quality print derivatives for AI-generated images
 * when the print pipeline is enabled.
 * 
 * Feature-flagged: Only runs when ENABLE_PRINT_PIPELINE=true
 */

const cloudinary = require('cloudinary').v2;

/**
 * Check if print pipeline is enabled
 */
function isPrintPipelineEnabled() {
  return process.env.ENABLE_PRINT_PIPELINE === 'true';
}

/**
 * Generate a print-quality derivative for an AI image
 */
async function generatePrintDerivative(publicId, widthInches, heightInches, targetDpi = 150) {
  if (!isPrintPipelineEnabled()) {
    console.log('[Print-Derivative] Print pipeline disabled, skipping derivative generation');
    return null;
  }

  try {
    console.log('[Print-Derivative] ========================================');
    console.log('[Print-Derivative] Generating print derivative');
    console.log('[Print-Derivative] Source:', publicId);
    console.log('[Print-Derivative] Size:', `${widthInches}×${heightInches} inches`);
    console.log('[Print-Derivative] Target DPI:', targetDpi);
    console.log('[Print-Derivative] ========================================');

    const startTime = Date.now();

    // Calculate exact pixel dimensions
    const widthPixels = Math.round(widthInches * targetDpi);
    const heightPixels = Math.round(heightInches * targetDpi);

    console.log('[Print-Derivative] Target dimensions:', `${widthPixels}×${heightPixels}px`);

    // Generate print derivative using Cloudinary's explicit API
    const result = await cloudinary.uploader.explicit(publicId, {
      type: 'upload',
      eager: [
        {
          width: widthPixels,
          height: heightPixels,
          crop: 'fill',
          gravity: 'center',
          quality: 'auto:best',
          fetch_format: 'png',
          color_space: 'srgb',
        }
      ],
      eager_async: true,
      eager_notification_url: process.env.CLOUDINARY_WEBHOOK_URL,
    });

    const elapsed = Date.now() - startTime;

    console.log('[Print-Derivative] ========================================');
    console.log('[Print-Derivative] Print derivative queued successfully');
    console.log('[Print-Derivative] Time:', `${elapsed}ms`);
    console.log('[Print-Derivative] Eager transformations:', result.eager?.length || 0);
    console.log('[Print-Derivative] ========================================');

    const printDerivative = result.eager?.[0];
    if (printDerivative) {
      return {
        url: printDerivative.secure_url,
        width: printDerivative.width,
        height: printDerivative.height,
        format: printDerivative.format,
        bytes: printDerivative.bytes,
        effectiveDPI: Math.round(printDerivative.width / widthInches),
      };
    }

    return null;
  } catch (error) {
    console.error('[Print-Derivative] ========================================');
    console.error('[Print-Derivative] ERROR generating print derivative');
    console.error('[Print-Derivative] ========================================');
    console.error('[Print-Derivative] Error:', error.message);
    console.error('[Print-Derivative] Stack:', error.stack);
    console.error('[Print-Derivative] ========================================');
    
    return null;
  }
}

/**
 * Generate print derivatives for multiple AI images (batch)
 */
async function generatePrintDerivatives(images, widthInches, heightInches, targetDpi = 150) {
  if (!isPrintPipelineEnabled()) {
    console.log('[Print-Derivative] Print pipeline disabled, skipping batch derivative generation');
    return [];
  }

  console.log('[Print-Derivative] ========================================');
  console.log('[Print-Derivative] Batch generating print derivatives');
  console.log('[Print-Derivative] Count:', images.length);
  console.log('[Print-Derivative] ========================================');

  const promises = images.map((image, index) => {
    const publicId = image.cloudinary_public_id || image.public_id;
    if (!publicId) {
      console.warn(`[Print-Derivative] Image ${index} missing public_id, skipping`);
      return Promise.resolve(null);
    }

    return generatePrintDerivative(publicId, widthInches, heightInches, targetDpi)
      .catch(error => {
        console.error(`[Print-Derivative] Failed to generate derivative for image ${index}:`, error.message);
        return null;
      });
  });

  const derivatives = await Promise.all(promises);

  console.log('[Print-Derivative] ========================================');
  console.log('[Print-Derivative] Batch generation complete');
  console.log('[Print-Derivative] Successful:', derivatives.filter(d => d !== null).length);
  console.log('[Print-Derivative] Failed:', derivatives.filter(d => d === null).length);
  console.log('[Print-Derivative] ========================================');

  return derivatives;
}

module.exports = {
  isPrintPipelineEnabled,
  generatePrintDerivative,
  generatePrintDerivatives,
};
