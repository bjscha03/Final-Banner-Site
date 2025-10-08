/**
 * Netlify Function: render-order-pdf
 * Generates press-ready PDF from banner design
 */

const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const { neon } = require('@neondatabase/serverless');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sql = neon(process.env.NETLIFY_DATABASE_URL);

/**
 * Choose target DPI based on banner size
 */
function chooseTargetDpi(wIn, hIn) {
  const maxDim = Math.max(wIn, hIn);
  return maxDim > 24 ? 150 : 300;
}

/**
 * Clamp a value between min and max
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Fetch image from URL and return as Buffer
 */
async function fetchImage(urlOrKey, isFileKey = false) {
  const startTime = Date.now();
  
  if (isFileKey) {
    console.log('[PDF] Fetching from Cloudinary with key:', urlOrKey);
    const cloudinaryUrl = cloudinary.url(urlOrKey, {
      resource_type: 'image',
      secure: true
    });
    console.log('[PDF] Generated Cloudinary URL:', cloudinaryUrl);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    try {
      const response = await fetch(cloudinaryUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      console.log(`[PDF] Fetch completed in ${Date.now() - startTime}ms, status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log(`[PDF] Image downloaded: ${arrayBuffer.byteLength} bytes`);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Image fetch timed out after 8 seconds');
      }
      throw error;
    }
  } else {
    console.log('[PDF] Fetching image from URL:', urlOrKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    try {
      const response = await fetch(urlOrKey, { signal: controller.abort });
      clearTimeout(timeout);
      
      console.log(`[PDF] Fetch completed in ${Date.now() - startTime}ms, status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log(`[PDF] Image downloaded: ${arrayBuffer.byteLength} bytes`);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Image fetch timed out after 8 seconds');
      }
      throw error;
    }
  }
}









/**
 * Upscale image if needed to meet target resolution
 */
async function maybeUpscaleToFit(imgBuffer, needW, needH) {
  const meta = await sharp(imgBuffer).metadata();
  const sw = meta.width || 1;
  const sh = meta.height || 1;

  console.log(`[PDF] Source image: ${sw}×${sh}px, need: ${needW}×${needH}px`);

  if (sw >= needW && sh >= needH) {
    console.log('[PDF] Image resolution sufficient, no upscaling needed');
    return imgBuffer;
  }

  const scale = clamp(Math.max(needW / sw, needH / sh), 1, 4);
  const newW = Math.round(sw * scale);
  const newH = Math.round(sh * scale);

  console.log(`[PDF] Upscaling ${scale.toFixed(2)}× to ${newW}×${newH}px`);

  return await sharp(imgBuffer)
    .resize(newW, newH, {
      kernel: 'lanczos3',
      fit: 'fill',
    })
    .toBuffer();
}

/**
 * Convert raster image to PDF
 */
async function rasterToPdfBuffer(imgBuffer, pageWidthIn, pageHeightIn) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const pageWidthPt = pageWidthIn * 72;
    const pageHeightPt = pageHeightIn * 72;

    const doc = new PDFDocument({
      size: [pageWidthPt, pageHeightPt],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      compress: true,
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.image(imgBuffer, 0, 0, {
      width: pageWidthPt,
      height: pageHeightPt,
      fit: [pageWidthPt, pageHeightPt],
      align: 'center',
      valign: 'center',
    });

    doc.end();
  });
}

/**
 * Update order in database
 */
async function updateOrder(orderId, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
  
  const query = `
    UPDATE orders
    SET ${setClause}, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  
  const result = await sql(query, [orderId, ...values]);
  return result[0];
}

exports.handler = async (event) => {
  console.log('[PDF] === Starting PDF render request ===');
  
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const req = JSON.parse(event.body);
    console.log('[PDF] Request:', JSON.stringify(req, null, 2));

    // Accept either fileKey (preferred) or imageUrl (legacy)
    if (!req.orderId || !req.bannerWidthIn || !req.bannerHeightIn || (!req.fileKey && !req.imageUrl)) {
      console.error('[PDF] Missing required fields:', {
        orderId: !!req.orderId,
        bannerWidthIn: !!req.bannerWidthIn,
        bannerHeightIn: !!req.bannerHeightIn,
        fileKey: !!req.fileKey,
        imageUrl: !!req.imageUrl
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const bleedIn = req.bleedIn ?? 0.125;
    const targetDpi = req.targetDpi ?? chooseTargetDpi(req.bannerWidthIn, req.bannerHeightIn);

    console.log(`[PDF] Banner: ${req.bannerWidthIn}×${req.bannerHeightIn} in, DPI: ${targetDpi}, Bleed: ${bleedIn} in`);

    const finalWidthIn = req.bannerWidthIn + (bleedIn * 2);
    const finalHeightIn = req.bannerHeightIn + (bleedIn * 2);
    const targetPxW = Math.round(finalWidthIn * targetDpi);
    const targetPxH = Math.round(finalHeightIn * targetDpi);

    console.log(`[PDF] Final dimensions: ${finalWidthIn}×${finalHeightIn} in = ${targetPxW}×${targetPxH}px`);

    // Fetch image using fileKey if available, otherwise imageUrl
    const sourceBuffer = req.fileKey 
      ? await fetchImage(req.fileKey, true)
      : await fetchImage(req.imageUrl, false);
    
    let rotatedBuffer = sourceBuffer;
    if (req.transform.rotationDeg && req.transform.rotationDeg !== 0) {
      console.log(`[PDF] Rotating image ${req.transform.rotationDeg}°`);
      rotatedBuffer = await sharp(sourceBuffer)
        .rotate(req.transform.rotationDeg)
        .toBuffer();
    }

    const rotatedMeta = await sharp(rotatedBuffer).metadata();
    const srcW = rotatedMeta.width || 1;
    const srcH = rotatedMeta.height || 1;

    const previewW = Math.max(1, req.previewCanvasPx.width);
    const previewH = Math.max(1, req.previewCanvasPx.height);
    const pxScale = targetPxW / previewW;

    console.log(`[PDF] Preview canvas: ${previewW}×${previewH}px, scale factor: ${pxScale.toFixed(2)}`);

    const scaledImageW = Math.round(srcW * req.transform.scale * pxScale);
    const scaledImageH = Math.round(srcH * req.transform.scale * pxScale);
    const translateX = Math.round(req.transform.translateXpx * pxScale);
    const translateY = Math.round(req.transform.translateYpx * pxScale);

    console.log(`[PDF] Scaled image: ${scaledImageW}×${scaledImageH}px at (${translateX}, ${translateY})`);

    const upscaledBuffer = await maybeUpscaleToFit(rotatedBuffer, scaledImageW, scaledImageH);

    const resizedBuffer = await sharp(upscaledBuffer)
      .resize(scaledImageW, scaledImageH, {
        kernel: 'lanczos3',
        fit: 'fill',
      })
      .toBuffer();

    const whiteCanvas = await sharp({
      create: {
        width: targetPxW,
        height: targetPxH,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    // Get actual dimensions of resized image
    const resizedMeta = await sharp(resizedBuffer).metadata();
    const resizedW = resizedMeta.width || scaledImageW;
    const resizedH = resizedMeta.height || scaledImageH;
    
    console.log(`[PDF] Canvas: ${targetPxW}×${targetPxH}px, Image: ${resizedW}×${resizedH}px, Position: (${translateX}, ${translateY})`);
    
    // Ensure the image fits within canvas bounds
    // If image extends beyond canvas, we need to extract/crop it
    let compositeInput = resizedBuffer;
    let compositeTop = translateY;
    let compositeLeft = translateX;
    
    // Check if we need to crop the image to fit within canvas
    const needsCrop = (
      translateX < 0 || 
      translateY < 0 || 
      translateX + resizedW > targetPxW || 
      translateY + resizedH > targetPxH
    );
    
    if (needsCrop) {
      console.log('[PDF] Image extends beyond canvas, cropping to fit');
      
      // Calculate crop region
      const cropLeft = Math.max(0, -translateX);
      const cropTop = Math.max(0, -translateY);
      const cropWidth = Math.min(resizedW - cropLeft, targetPxW - Math.max(0, translateX));
      const cropHeight = Math.min(resizedH - cropTop, targetPxH - Math.max(0, translateY));
      
      console.log(`[PDF] Crop region: ${cropWidth}×${cropHeight}px from (${cropLeft}, ${cropTop})`);
      
      compositeInput = await sharp(resizedBuffer)
        .extract({
          left: cropLeft,
          top: cropTop,
          width: Math.max(1, Math.floor(cropWidth)),
          height: Math.max(1, Math.floor(cropHeight))
        })
        .toBuffer();
      
      compositeTop = Math.max(0, translateY);
      compositeLeft = Math.max(0, translateX);
    }

    const merged = await sharp(whiteCanvas)
      .composite([
        {
          input: compositeInput,
          top: compositeTop,
          left: compositeLeft,
        },
      ])
      .png()
      .toBuffer();

    console.log('[PDF] Image composited onto canvas');

    const pdfBuffer = await rasterToPdfBuffer(merged, finalWidthIn, finalHeightIn);
    console.log(`[PDF] PDF generated: ${pdfBuffer.length} bytes`);

    const publicId = `final_banners/order_${req.orderId}_final`;
    console.log(`[PDF] Uploading to Cloudinary: ${publicId}`);

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'final_banners',
          public_id: publicId,
          format: 'pdf',
          overwrite: true,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(pdfBuffer);
    });

    const finalPdfUrl = uploadResult.secure_url;
    console.log(`[PDF] Uploaded successfully: ${finalPdfUrl}`);

    const meta = {
      dpi: targetDpi,
      bleedIn,
      sourceImageUrl: req.imageUrl,
      imageSource: req.imageSource,
      previewCanvasPx: req.previewCanvasPx,
      transform: req.transform,
    };

    try {
      await updateOrder(req.orderId, {
        final_pdf_url: finalPdfUrl,
        final_pdf_public_id: publicId,
        rendered_at: new Date().toISOString(),
        render_meta: JSON.stringify(meta),
      });
      console.log('[PDF] Order updated in database');
    } catch (dbError) {
      console.error('[PDF] Database update failed:', dbError);
    }

    const response = {
      finalPdfUrl,
      publicId,
      dpi: targetDpi,
      bleedIn,
      renderedAt: new Date().toISOString(),
      meta,
    };

    console.log('[PDF] === PDF render complete ===');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[PDF] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'PDF generation failed',
        message: error.message || String(error),
      }),
    };
  }
};
