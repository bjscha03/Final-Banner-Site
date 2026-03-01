/**
 * Print-Grade PDF/JPEG Generator (Beta)
 * 
 * Generates high-quality, print-ready PDFs with:
 * - JPEG images at 300 DPI for vendor output
 * - sRGB color space
 * - Vector text (not rasterized)
 * - Crop marks for cutting guides
 * 
 * Feature-flagged: Returns 403 if ENABLE_PRINT_PIPELINE !== 'true'
 */

const PDFDocument = require('pdfkit');
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Check if print pipeline is enabled
 */
function isPrintPipelineEnabled() {
  return process.env.ENABLE_PRINT_PIPELINE === 'true';
}

/**
 * Get print pipeline configuration
 */
function getPrintConfig() {
  return {
    defaultDpi: parseInt(process.env.PRINT_DEFAULT_DPI || '300', 10),
    bleedInches: parseFloat(process.env.PRINT_BLEED_IN || '0.25'),
    colorSpace: process.env.PRINT_COLOR_SPACE || 'srgb',
    format: process.env.PRINT_FORMAT || 'jpeg',
  };
}

/**
 * Build print-quality Cloudinary URL
 */
function buildPrintCloudinaryUrl(publicId, widthPx, heightPx, applyColorCorrection = false) {
  const transformOptions = {
    resource_type: 'image',
    width: widthPx,
    height: heightPx,
    crop: 'fill',
    gravity: 'center',
    format: 'jpeg',
    // NO quality parameter - we want maximum quality
    // NO dpr - we want exact pixels
  };

  // Color correction (optional, for photos only)
  if (applyColorCorrection) {
    transformOptions.effect = 'viesus_correct';
  }

  console.log('[Print-PDF] Transform options:', JSON.stringify(transformOptions));
  
  // Use Cloudinary SDK to generate URL (same pattern as admin-download-file-new.cjs)
  const url = cloudinary.url(publicId, transformOptions);
  console.log('[Print-PDF] Generated URL:', url);
  
  return url;
}

/**
 * Fetch image from Cloudinary with print-quality transformations
 */
async function fetchPrintImage(fileKey, widthPx, heightPx, applyColorCorrection = false) {
  try {
    console.log('[Print-PDF] Fetching image:', fileKey);
    console.log('[Print-PDF] Dimensions:', `${widthPx}×${heightPx}px`);

    // CRITICAL FIX: Use cloudinary.uploader.explicit() to generate authenticated delivery URL
    // This is the proper way to get transformed images from Cloudinary with authentication
    const transformation = {
      width: widthPx,
      height: heightPx,
      crop: 'fill',
      gravity: 'center',
      format: 'jpeg',
    };
    
    if (applyColorCorrection) {
      transformation.effect = 'viesus_correct';
    }
    
    console.log('[Print-PDF] Requesting explicit transformation:', JSON.stringify(transformation));
    console.log('[Print-PDF] FileKey:', fileKey);
    
    // Use explicit() to generate the transformed version and get secure URL
    let result;
    try {
      result = await cloudinary.uploader.explicit(fileKey, {
        type: 'upload',
        resource_type: 'image',
        eager: [transformation],
      });
      console.log('[Print-PDF] Explicit result:', JSON.stringify(result, null, 2));
    } catch (explicitError) {
      console.error('[Print-PDF] Cloudinary explicit() failed:', explicitError.message);
      console.error('[Print-PDF] FileKey that failed:', fileKey);
      throw new Error(`Cloudinary resource not found: ${fileKey}. Error: ${explicitError.message}`);
    }
    
    // Get the secure URL - eager transformations return full URLs
    let url;
    if (result.eager && result.eager[0] && result.eager[0].secure_url) {
      url = result.eager[0].secure_url;
    } else if (result.secure_url) {
      url = result.secure_url;
    } else {
      // Fallback: build URL manually from result
      const baseUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
      const transformStr = `w_${widthPx},h_${heightPx},c_fill,g_center,f_jpeg`;
      url = `${baseUrl}/${transformStr}/${fileKey}`;
    }
    console.log('[Print-PDF] Using secure URL:', url);
    
    if (!url || !url.startsWith('http')) {
      throw new Error(`Invalid URL generated: ${url}`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    console.log('[Print-PDF] Image fetched:', buffer.length, 'bytes');

    return buffer;
  } catch (error) {
    console.error('[Print-PDF] Error fetching image:', error);
    throw error;
  }
}



/**
 * Draw crop marks at corners
 */
function drawCropMarks(doc, bannerWidthIn, bannerHeightIn, bleedIn) {
  const bannerWidthPt = bannerWidthIn * 72;
  const bannerHeightPt = bannerHeightIn * 72;
  const bleedPt = bleedIn * 72;
  const markLength = 18; // Length of crop marks in points

  doc.save();
  doc.strokeColor('#000000');
  doc.lineWidth(0.5);

  // Top-left
  doc.moveTo(bleedPt - markLength, bleedPt).lineTo(bleedPt, bleedPt).stroke();
  doc.moveTo(bleedPt, bleedPt - markLength).lineTo(bleedPt, bleedPt).stroke();

  // Top-right
  doc.moveTo(bleedPt + bannerWidthPt, bleedPt - markLength).lineTo(bleedPt + bannerWidthPt, bleedPt).stroke();
  doc.moveTo(bleedPt + bannerWidthPt, bleedPt).lineTo(bleedPt + bannerWidthPt + markLength, bleedPt).stroke();

  // Bottom-left
  doc.moveTo(bleedPt - markLength, bleedPt + bannerHeightPt).lineTo(bleedPt, bleedPt + bannerHeightPt).stroke();
  doc.moveTo(bleedPt, bleedPt + bannerHeightPt).lineTo(bleedPt, bleedPt + bannerHeightPt + markLength).stroke();

  // Bottom-right
  doc.moveTo(bleedPt + bannerWidthPt, bleedPt + bannerHeightPt).lineTo(bleedPt + bannerWidthPt + markLength, bleedPt + bannerHeightPt).stroke();
  doc.moveTo(bleedPt + bannerWidthPt, bleedPt + bannerHeightPt).lineTo(bleedPt + bannerWidthPt, bleedPt + bannerHeightPt + markLength).stroke();

  doc.restore();
}

/**
 * Create print-grade PDF
 */
async function createPrintPDF(imageBuffer, pageWidthIn, pageHeightIn, textElements = [], options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const {
        bleedInches = 0.25,
        includeCropMarks = true,
        compress = false,
      } = options;

      console.log('[Print-PDF] Creating PDF...');
      console.log('[Print-PDF] Page size:', `${pageWidthIn}×${pageHeightIn} inches`);
      console.log('[Print-PDF] Bleed:', `${bleedInches} inches`);

      // Convert inches to points (1 inch = 72 points)
      const pageWidthPt = pageWidthIn * 72;
      const pageHeightPt = pageHeightIn * 72;
      const bleedPt = bleedInches * 72;

      // Create PDF document
      const doc = new PDFDocument({
        size: [pageWidthPt, pageHeightPt],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        compress: compress, // No compression for print quality
        autoFirstPage: false,
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log('[Print-PDF] PDF created:', pdfBuffer.length, 'bytes');
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Add page
      doc.addPage();

      // Calculate banner dimensions (page minus bleed)
      const bannerWidthIn = pageWidthIn - (2 * bleedInches);
      const bannerHeightIn = pageHeightIn - (2 * bleedInches);
      const bannerWidthPt = bannerWidthIn * 72;
      const bannerHeightPt = bannerHeightIn * 72;

      // Draw crop marks
      if (includeCropMarks) {
        drawCropMarks(doc, bannerWidthIn, bannerHeightIn, bleedInches);
      }

      // Add image (fill entire banner area, stretching if needed)
      // Do NOT use 'fit' as that maintains aspect ratio - we want the image to fill exactly
      doc.image(imageBuffer, bleedPt, bleedPt, {
        width: bannerWidthPt,
        height: bannerHeightPt,
      });

      // Add text elements (vector text, not rasterized)
      if (textElements && textElements.length > 0) {
        textElements.forEach((textEl) => {
          const {
            text,
            x = 0,
            y = 0,
            fontSize = 12,
            fontFamily = 'Helvetica',
            color = '#000000',
            align = 'left',
          } = textEl;

          doc.font(fontFamily);
          doc.fontSize(fontSize);
          doc.fillColor(color);
          doc.text(text, bleedPt + x, bleedPt + y, { align });
        });
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error('[Print-PDF] Error creating PDF:', error);
      reject(error);
    }
  });
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('[Print-PDF] ========================================');
  console.log('[Print-PDF] Print-Grade PDF Request');
  console.log('[Print-PDF] ========================================');

  // Check if print pipeline is enabled
  if (!isPrintPipelineEnabled()) {
    console.log('[Print-PDF] Print pipeline is disabled');
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Print pipeline is not enabled',
        message: 'Set ENABLE_PRINT_PIPELINE=true to enable this feature',
      }),
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      orderId,
      fileKey,
      imageUrl,
      bannerWidthIn,
      bannerHeightIn,
      targetDpi = 300,
      bleedIn = 0.25,
      textElements = [],
      applyColorCorrection = true,
    } = body;

    console.log('[Print-PDF] Order ID:', orderId);
    console.log('[Print-PDF] File Key:', fileKey);
    console.log('[Print-PDF] Image URL:', imageUrl);
    console.log('[Print-PDF] Banner Size:', `${bannerWidthIn}×${bannerHeightIn} inches`);
    console.log('[Print-PDF] Target DPI:', targetDpi);
    console.log('[Print-PDF] Bleed:', `${bleedIn} inches`);

    // Validate required fields - need either fileKey or imageUrl
    if ((!fileKey && !imageUrl) || !bannerWidthIn || !bannerHeightIn) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['fileKey OR imageUrl', 'bannerWidthIn', 'bannerHeightIn'],
        }),
      };
    }

    // Calculate pixel dimensions
    const widthPx = Math.round(bannerWidthIn * targetDpi);
    const heightPx = Math.round(bannerHeightIn * targetDpi);

    console.log('[Print-PDF] Target pixels:', `${widthPx}×${heightPx}px`);

    // Fetch image - either from Cloudinary (fileKey) or direct URL (imageUrl)
    let imageBuffer;
    if (imageUrl) {
      console.log('[Print-PDF] Fetching from direct URL:', imageUrl);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }
      imageBuffer = await response.buffer();
      console.log('[Print-PDF] Image fetched from URL:', imageBuffer.length, 'bytes');
    } else if (fileKey) {
      // Fetch from Cloudinary with print-quality transformations
      console.log('[Print-PDF] Fetching from Cloudinary with fileKey:', fileKey);
      imageBuffer = await fetchPrintImage(fileKey, widthPx, heightPx, applyColorCorrection);
    } else {
      throw new Error('Neither imageUrl nor fileKey provided - cannot fetch image');
    }

    // Calculate page size (banner + bleed)
    const pageWidthIn = bannerWidthIn + (2 * bleedIn);
    const pageHeightIn = bannerHeightIn + (2 * bleedIn);

    // Generate PDF
    const pdfBuffer = await createPrintPDF(imageBuffer, pageWidthIn, pageHeightIn, textElements, {
      bleedInches: bleedIn,
      includeCropMarks: true,
      compress: false,
    });

    console.log('[Print-PDF] ========================================');
    console.log('[Print-PDF] PDF Generated Successfully');
    console.log('[Print-PDF] Size:', pdfBuffer.length, 'bytes');
    console.log('[Print-PDF] ========================================');

    // Return PDF
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="banner-${orderId}-print-grade.pdf"`,
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('[Print-PDF] ========================================');
    console.error('[Print-PDF] ERROR');
    console.error('[Print-PDF] ========================================');
    console.error('[Print-PDF] Error:', error.message);
    console.error('[Print-PDF] Stack:', error.stack);
    console.error('[Print-PDF] ========================================');

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to generate print-grade PDF',
        message: error.message,
      }),
    };
  }
};
