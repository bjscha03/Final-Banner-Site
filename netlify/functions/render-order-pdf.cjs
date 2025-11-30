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
  return 150; // 150 DPI for print-ready quality (was 100 DPI)
}

/**
 * Clamp a value between min and max
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Draw crop marks on PDF for print cutting guides
 * Crop marks are placed at the corners of the banner area (inside the bleed)
 */
function drawCropMarks(doc, bannerWidthIn, bannerHeightIn, bleedIn) {
  const bleedPt = bleedIn * 72;
  const bannerWidthPt = bannerWidthIn * 72;
  const bannerHeightPt = bannerHeightIn * 72;
  
  const markLength = 18; // Length of crop mark in points (0.25 inch)
  const markOffset = 9;  // Distance from corner in points
  
  // Set crop mark style
  doc.strokeColor('#000000');
  doc.lineWidth(0.5);
  
  console.log('[PDF] Drawing crop marks at bleed boundary');
  
  // Top-left corner
  doc.moveTo(bleedPt - markOffset, bleedPt)
     .lineTo(bleedPt - markOffset - markLength, bleedPt)
     .stroke();
  doc.moveTo(bleedPt, bleedPt - markOffset)
     .lineTo(bleedPt, bleedPt - markOffset - markLength)
     .stroke();
  
  // Top-right corner
  doc.moveTo(bleedPt + bannerWidthPt + markOffset, bleedPt)
     .lineTo(bleedPt + bannerWidthPt + markOffset + markLength, bleedPt)
     .stroke();
  doc.moveTo(bleedPt + bannerWidthPt, bleedPt - markOffset)
     .lineTo(bleedPt + bannerWidthPt, bleedPt - markOffset - markLength)
     .stroke();
  
  // Bottom-left corner
  doc.moveTo(bleedPt - markOffset, bleedPt + bannerHeightPt)
     .lineTo(bleedPt - markOffset - markLength, bleedPt + bannerHeightPt)
     .stroke();
  doc.moveTo(bleedPt, bleedPt + bannerHeightPt + markOffset)
     .lineTo(bleedPt, bleedPt + bannerHeightPt + markOffset + markLength)
     .stroke();
  
  // Bottom-right corner
  doc.moveTo(bleedPt + bannerWidthPt + markOffset, bleedPt + bannerHeightPt)
     .lineTo(bleedPt + bannerWidthPt + markOffset + markLength, bleedPt + bannerHeightPt)
     .stroke();
  doc.moveTo(bleedPt + bannerWidthPt, bleedPt + bannerHeightPt + markOffset)
     .lineTo(bleedPt + bannerWidthPt, bleedPt + bannerHeightPt + markOffset + markLength)
     .stroke();
  
  console.log('[PDF] Crop marks drawn successfully');
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
      const response = await fetch(urlOrKey, { signal: controller.signal });
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
      console.error('[PDF] Error fetching image from URL:', error);
      console.error('[PDF] Error fetching image from URL:', error);
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
      kernel: 'cubic',
      fit: 'fill',
    })
    .toBuffer();
}

/**
 * Convert raster image to PDF with optional text layers
 */
async function rasterToPdfBuffer(imgBuffer, pageWidthIn, pageHeightIn, textElements = [], bannerWidthIn, bannerHeightIn, previewCanvasPx, bleedIn = 0.125) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const pageWidthPt = pageWidthIn * 72;
      const pageHeightPt = pageHeightIn * 72;

      const doc = new PDFDocument({
        size: [pageWidthPt, pageHeightPt],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        compress: true, // Enable compression to reduce file size
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => {
        console.error('[PDF] PDFDocument error:', err);
        reject(err);
      });

      // Add the base image
      doc.image(imgBuffer, 0, 0, {
        width: pageWidthPt,
        height: pageHeightPt,
        fit: [pageWidthPt, pageHeightPt],
        align: 'center',
        valign: 'center',
      });

      // Render text layers on top of the image
      if (textElements && textElements.length > 0) {
        console.log(`[PDF] Rendering ${textElements.length} text layers`);
        console.log(`[PDF] Banner dimensions: ${bannerWidthIn}" × ${bannerHeightIn}"`);
        console.log(`[PDF] PDF page dimensions: ${pageWidthPt}pt × ${pageHeightPt}pt`);
        console.log(`[PDF] Preview canvas: ${previewCanvasPx?.width || 'unknown'}px × ${previewCanvasPx?.height || 'unknown'}px`);
        
        textElements.forEach((textEl, index) => {
          try {
            console.log(`[PDF] Processing text element ${index + 1}/${textElements.length}: "${textEl.content}"`);
            console.log(`[PDF] Text element data:`, JSON.stringify({ xPercent: textEl.xPercent, yPercent: textEl.yPercent, fontSize: textEl.fontSize, color: textEl.color, textAlign: textEl.textAlign }));
            
            // CRITICAL CHECK: Ensure xPercent and yPercent exist
            if (textEl.xPercent === undefined || textEl.yPercent === undefined) {
              console.error(`[PDF] CRITICAL: Text element missing position data!`, textEl);
              return; // Skip this element
            }
            
            // CRITICAL COORDINATE CONVERSION FIX
            // Text percentages are stored relative to the SVG viewBox container
            // The SVG viewBox includes: rulers (1.2" each side) + bleed (0.25" each side)
            // Total offset on each side: 1.2 + 0.25 = 1.45 inches
            // 
            // SVG structure:
            // - totalWidth = bannerWidth + (1.2 * 2) + (0.25 * 2) = bannerWidth + 2.9"
            // - totalHeight = bannerHeight + (1.2 * 2) + (0.25 * 2) = bannerHeight + 2.9"
            // - Banner area starts at offset (1.45", 1.45") in the SVG
            //
            // To convert text positions:
            // 1. Text xPercent/yPercent are relative to the ENTIRE SVG viewBox (0-100%)
            // 2. We need to extract the position WITHIN the banner area
            // 3. Then convert to PDF points
            
            // CRITICAL COORDINATE CONVERSION FIX V2
            // DISCOVERY: Text percentages are NOT relative to the SVG viewBox!
            // They are relative to the CONTAINER that wraps the SVG.
            // Simply convert percentages directly to banner inches (no offset needed)
            const textXInBanner = (textEl.xPercent / 100) * bannerWidthIn;
            const textYInBanner = (textEl.yPercent / 100) * bannerHeightIn;
            
            // Convert to PDF points (72 points per inch)
            let xPt = textXInBanner * 72;
            let yPt = textYInBanner * 72;
            
            // DETAILED COORDINATE DEBUGGING
            console.log(`[PDF] ========== COORDINATE TRANSFORMATION DEBUG V2 ==========`);
            console.log(`[PDF] Input percentages: xPercent=${textEl.xPercent}%, yPercent=${textEl.yPercent}%`);
            console.log(`[PDF] Banner size: ${bannerWidthIn}" × ${bannerHeightIn}"`);
            console.log(`[PDF] Direct conversion (no offset): Position in banner: (${textXInBanner}", ${textYInBanner}")`);
            console.log(`[PDF] Final PDF points: (${xPt}pt, ${yPt}pt)`);
            console.log(`[PDF] Page size: ${pageWidthPt}pt × ${pageHeightPt}pt`);
            console.log(`[PDF] ============================================================`);
            console.log(`[PDF] Text positioning for "${textEl.content.substring(0, 30)}...":
              Stored: ${textEl.xPercent.toFixed(2)}%, ${textEl.yPercent.toFixed(2)}% (relative to SVG viewBox)
              Position in banner: ${textXInBanner.toFixed(2)}", ${textYInBanner.toFixed(2)}"
              PDF points: ${xPt.toFixed(2)}pt, ${yPt.toFixed(2)}pt
              Page size: ${pageWidthPt.toFixed(2)}pt × ${pageHeightPt.toFixed(2)}pt
            `);
            


            // Set font properties
            const fontFamily = textEl.fontFamily || 'Helvetica';
            
            // CRITICAL: Scale fontSize for print output
            // The fontSize is stored as screen pixels (for preview at ~600-800px wide)
            // But the PDF is much larger (e.g., 48" = 3456 points)
            // Scale factor: Assume preview canvas is ~600px for a 48" banner
            // So for a 48" banner: scaleFactor = 3456pt / 600px ≈ 5.76
            // General formula: scaleFactor = pageWidthPt / 600
            const PREVIEW_CANVAS_WIDTH_PX = previewCanvasPx?.width || 600; // Use actual preview canvas width
            const scaleFactor = pageWidthPt / PREVIEW_CANVAS_WIDTH_PX;
            const fontSize = (textEl.fontSize || 24) * scaleFactor;
            
            const fontWeight = textEl.fontWeight === 'bold' ? 'bold' : 'normal';
            
            // Map font family to PDFKit built-in fonts
            let pdfFont = 'Helvetica';
            if (fontFamily.toLowerCase().includes('times')) {
              pdfFont = fontWeight === 'bold' ? 'Times-Bold' : 'Times-Roman';
            } else if (fontFamily.toLowerCase().includes('courier')) {
              pdfFont = fontWeight === 'bold' ? 'Courier-Bold' : 'Courier';
            } else {
              pdfFont = fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica';
            }
            
            // Set font and color
            doc.font(pdfFont);
            doc.fontSize(fontSize);
            doc.fillColor(textEl.color || '#000000');
            
            // SAFETY CHECK: Ensure coordinates are valid
            if (isNaN(xPt) || isNaN(yPt)) {
              console.error(`[PDF] Invalid coordinates for text "${textEl.content}": xPt=${xPt}, yPt=${yPt}`);
              console.error(`[PDF] Debug values: xPercent=${textEl.xPercent}, yPercent=${textEl.yPercent}, bannerWidth=${bannerWidthIn}, bannerHeight=${bannerHeightIn}`);
              return; // Skip this text element
            }
            
            // SAFETY CHECK: Ensure coordinates are within page bounds
            if (xPt < 0 || xPt > pageWidthPt || yPt < 0 || yPt > pageHeightPt) {
              console.warn(`[PDF] Text "${textEl.content}" is outside page bounds: (${xPt.toFixed(2)}, ${yPt.toFixed(2)})`);
              console.warn(`[PDF] Page bounds: (0, 0) to (${pageWidthPt}, ${pageHeightPt})`);
              // Clamp to page bounds
              const clampedX = Math.max(0, Math.min(xPt, pageWidthPt - 100));
              const clampedY = Math.max(0, Math.min(yPt, pageHeightPt - 100));
              console.warn(`[PDF] Clamping to: (${clampedX.toFixed(2)}, ${clampedY.toFixed(2)})`);
              // Actually use the clamped values
              xPt = clampedX;
              yPt = clampedY;
            }
            
            // Calculate text alignment
            const textAlign = textEl.textAlign || 'left';
            
            // CRITICAL FIX V3: Text positioning to match preview EXACTLY
            // 
            // Preview behavior (DraggableText.tsx):
            // - CSS: position: absolute; left: X%; top: Y%; text-align: center;
            // - X%, Y% = top-left corner of the text element's bounding box
            // - text-align centers the text WITHIN that bounding box
            // - The text element has natural width based on content
            //
            // PDF behavior (PDFKit):
            // - doc.text(content, x, y, {align, width}) renders text in a box
            // - For center align: text is centered within the specified width
            // - y coordinate is the BASELINE, not the top edge
            //
            // Solution:
            // 1. Calculate the natural width of the text
            // 2. For center-aligned text, adjust x so text appears at same visual position
            // 3. Adjust y for baseline offset
            
            // Calculate natural text width
            doc.font(pdfFont);
            doc.fontSize(fontSize);
            const textWidth = doc.widthOfString(textEl.content);
            
            console.log(`[PDF] Text "${textEl.content.substring(0, 30)}" natural width: ${textWidth.toFixed(2)}pt`);
            
            let textX = xPt;
            let renderWidth = textWidth + 20; // Add some padding
            
            // Adjust Y coordinate for font baseline
            // In CSS, top: Y% positions the top edge of the element
            // In PDFKit, y is the baseline position
            // Font ascent is approximately 75% of fontSize
            const fontAscent = fontSize * 0.75;
            yPt = yPt + fontAscent;
            
            if (textAlign === 'center') {
              // For centered text in preview:
              // - xPercent is the left edge of the text element
              // - Text is centered within its natural width
              // - So the visual center is at: xPercent + (naturalWidth / 2)
              //
              // In PDF, to center text at the same visual position:
              // - We need the text box to be centered at the same point
              // - Use the text's natural width and center it around the visual center point
              
              // Don't change textX - it's already the left edge where text should start
              // Just use the natural width for rendering
              renderWidth = textWidth + 40; // Extra padding for center-aligned text
            } else if (textAlign === 'right') {
              // For right-aligned text, xPercent is still the left edge of the element
              // Text extends leftward from the right edge of the element
              // Keep the same logic
              renderWidth = textWidth + 20;
            } else {
              // Left-aligned: straightforward
              renderWidth = textWidth + 20;
            }
            
            const textOptions = {
              align: textAlign,
              lineBreak: true,
              width: renderWidth,
            };
            
            console.log(`[PDF] Rendering text at (${textX.toFixed(2)}, ${yPt.toFixed(2)}) with width ${renderWidth.toFixed(2)}pt, align: ${textAlign}, fontSize: ${fontSize.toFixed(2)}pt`);
            
            // Render the text
            doc.text(textEl.content, textX, yPt, textOptions);

            
            console.log(`[PDF] ✓ Successfully rendered text "${textEl.content.substring(0, 30)}..."`);
            
            console.log(`[PDF] Rendered text layer ${index + 1}: "${textEl.content.substring(0, 30)}..." at (${xPt.toFixed(1)}, ${yPt.toFixed(1)}) - fontSize: ${textEl.fontSize}px → ${fontSize.toFixed(1)}pt (scale: ${scaleFactor.toFixed(2)}x)`);
          } catch (textError) {
            console.error(`[PDF] Error rendering text layer ${index + 1}:`, textError);
            // Continue rendering other text layers even if one fails
          }
        });
      }

      // Draw crop marks for print cutting guides
      drawCropMarks(doc, bannerWidthIn, bannerHeightIn, bleedIn);

      doc.end();
    } catch (err) {
      console.error('[PDF] Synchronous error in rasterToPdfBuffer:', err);
      reject(err);
    }
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
  console.log('[PDF] Event method:', event.httpMethod);
  console.log('[PDF] Event body type:', typeof event.body);
  console.log('[PDF] Event body:', event.body);
  
  try {
    if (!event.body) {
      console.error('[PDF] ERROR: No request body provided');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const req = JSON.parse(event.body);
    console.log('[PDF] Parsed request:', JSON.stringify(req, null, 2));
    console.log('[PDF] Request keys:', Object.keys(req));
    console.log('[PDF] CRITICAL - textElements received:', req.textElements);
    console.log('[PDF] CRITICAL - textElements count:', req.textElements ? req.textElements.length : 0);
    console.log('[PDF] CRITICAL - overlayImage received:', req.overlayImage);
    console.log('[PDF] CRITICAL - overlayImage exists:', !!req.overlayImage);
    console.log('[PDF] CRITICAL - overlayImage received:', req.overlayImage);
    console.log('[PDF] CRITICAL - overlayImage exists:', !!req.overlayImage);

    // Accept fileKey, imageUrl, OR text-only designs (no background image)
    // For text-only designs, we create a white/colored canvas as background
    const hasBackgroundImage = req.fileKey || req.imageUrl;
    const hasTextOrOverlay = (req.textElements && req.textElements.length > 0) || req.overlayImage;
    
    if (!req.orderId || !req.bannerWidthIn || !req.bannerHeightIn || (!hasBackgroundImage && !hasTextOrOverlay)) {
      console.error('[PDF] Missing required fields:', {
        orderId: !!req.orderId,
        bannerWidthIn: !!req.bannerWidthIn,
        bannerHeightIn: !!req.bannerHeightIn,
        fileKey: !!req.fileKey,
        imageUrl: !!req.imageUrl,
        hasTextOrOverlay: hasTextOrOverlay
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields - need image, text, or overlay' }),
      };
    }
    
    console.log('[PDF] Design type:', hasBackgroundImage ? 'with background image' : 'text/overlay only');

    const bleedIn = req.bleedIn ?? 0.125;
    const targetDpi = req.targetDpi ?? chooseTargetDpi(req.bannerWidthIn, req.bannerHeightIn);

    console.log(`[PDF] Banner: ${req.bannerWidthIn}×${req.bannerHeightIn} in, DPI: ${targetDpi}, Bleed: ${bleedIn} in`);

    const finalWidthIn = req.bannerWidthIn + (bleedIn * 2);
    const finalHeightIn = req.bannerHeightIn + (bleedIn * 2);
    const targetPxW = Math.round(finalWidthIn * targetDpi);
    const targetPxH = Math.round(finalHeightIn * targetDpi);

    console.log(`[PDF] Final dimensions: ${finalWidthIn}×${finalHeightIn} in = ${targetPxW}×${targetPxH}px`);

    // Fetch image using fileKey if available, otherwise imageUrl, or create white canvas for text-only
    let sourceBuffer;
    if (req.fileKey) {
      sourceBuffer = await fetchImage(req.fileKey, true);
    } else if (req.imageUrl) {
      sourceBuffer = await fetchImage(req.imageUrl, false);
    } else {
      // Text-only design: create a white (or colored) background canvas
      const bgColor = req.canvasBackgroundColor || '#FFFFFF';
      console.log('[PDF] Creating blank canvas with background color:', bgColor);
      
      // Parse hex color to RGB
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
      };
      const rgb = hexToRgb(bgColor);
      
      sourceBuffer = await sharp({
        create: {
          width: targetPxW,
          height: targetPxH,
          channels: 3,
          background: rgb,
        },
      }).png().toBuffer();
      
      console.log('[PDF] Created blank canvas:', targetPxW, 'x', targetPxH);
    }
    
    // Flag to track if this is a text-only design (no background image)
    const isTextOnlyDesign = !req.fileKey && !req.imageUrl;
    
    let rotatedBuffer = sourceBuffer;
    if (req.transform?.rotationDeg && req.transform.rotationDeg !== 0) {
      console.log(`[PDF] Rotating image ${req.transform.rotationDeg}°`);
      rotatedBuffer = await sharp(sourceBuffer)
        .rotate(req.transform.rotationDeg)
        .toBuffer();
    }

    const rotatedMeta = await sharp(rotatedBuffer).metadata();
    const srcW = rotatedMeta.width || 1;
    const srcH = rotatedMeta.height || 1;

    const previewW = Math.max(1, req.previewCanvasPx?.width || targetPxW);
    const previewH = Math.max(1, req.previewCanvasPx?.height || targetPxH);
    const pxScale = targetPxW / previewW;

    console.log(`[PDF] Preview canvas: ${previewW}×${previewH}px, scale factor: ${pxScale.toFixed(2)}`);
    
    // Calculate default transform if not provided
    // Scale image to fill the banner (cover mode)
    let transform = req.transform;
    if (!transform) {
      const scaleX = previewW / srcW;
      const scaleY = previewH / srcH;
      const scale = Math.max(scaleX, scaleY); // Cover mode - fill entire banner
      const translateXpx = (previewW - srcW * scale) / 2; // Center horizontally
      const translateYpx = (previewH - srcH * scale) / 2; // Center vertically
      transform = { scale, translateXpx, translateYpx };
      console.log(`[PDF] Auto-calculated transform: scale=${scale.toFixed(2)}, translate=(${translateXpx.toFixed(0)}, ${translateYpx.toFixed(0)})`);
    }

    const scaledImageW = Math.round(srcW * transform.scale * pxScale);
    const scaledImageH = Math.round(srcH * transform.scale * pxScale);
    const translateX = Math.round(transform.translateXpx * pxScale);
    const translateY = Math.round(transform.translateYpx * pxScale);

    console.log(`[PDF] Scaled image: ${scaledImageW}×${scaledImageH}px at (${translateX}, ${translateY})`);

    const upscaledBuffer = await maybeUpscaleToFit(rotatedBuffer, scaledImageW, scaledImageH);

    const resizedBuffer = await sharp(upscaledBuffer)
      .resize(scaledImageW, scaledImageH, {
        kernel: 'cubic', // Faster than lanczos3
        fit: 'fill',
      })
      .toBuffer();

    // For text-only designs, use the already-created colored canvas; otherwise create white
    const whiteCanvas = isTextOnlyDesign ? sourceBuffer : await sharp({
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

    // Build composite layers array - background first, then overlay if exists
    // For text-only designs, we already have the correct canvas, no need to composite the "image"
    const compositeLayers = isTextOnlyDesign ? [] : [
      {
        input: compositeInput,
        top: compositeTop,
        left: compositeLeft,
      },
    ];

    // Add overlay image if provided
    console.log('[PDF] ========== OVERLAY IMAGE DEBUG ==========');
    console.log('[PDF] req.overlayImage exists:', !!req.overlayImage);
    console.log('[PDF] req.overlayImage full object:', JSON.stringify(req.overlayImage, null, 2));
    
    if (req.overlayImage) {
      console.log('[PDF] Overlay image data received:');
      console.log('[PDF]   - name:', req.overlayImage.name);
      console.log('[PDF]   - url:', req.overlayImage.url);
      console.log('[PDF]   - fileKey:', req.overlayImage.fileKey);
      console.log('[PDF]   - position:', req.overlayImage.position);
      console.log('[PDF]   - scale:', req.overlayImage.scale);
      console.log('[PDF]   - aspectRatio:', req.overlayImage.aspectRatio);
      
      // Check if we have either url or fileKey
      if (!req.overlayImage.url && !req.overlayImage.fileKey) {
        console.error('[PDF] ERROR: Overlay image has neither url nor fileKey!');
      } else {
        console.log('[PDF] ✅ Overlay image has valid source, proceeding with rendering...');
      }
    } else {
      console.log('[PDF] ℹ️ No overlay image in request');
    }
    console.log('[PDF] ==========================================');
    
    if (req.overlayImage && (req.overlayImage.url || req.overlayImage.fileKey)) {
      console.log('[PDF] Processing overlay image:', req.overlayImage.name);
      console.log('[PDF] Overlay position:', req.overlayImage.position);
      console.log('[PDF] Overlay scale:', req.overlayImage.scale);
      console.log('[PDF] Overlay URL:', req.overlayImage.url);
      console.log('[PDF] Overlay fileKey:', req.overlayImage.fileKey);
      console.log('[PDF] Overlay URL:', req.overlayImage.url);
      console.log('[PDF] Overlay fileKey:', req.overlayImage.fileKey);
      
      try {
        // Fetch overlay image from Cloudinary
        const overlayBuffer = req.overlayImage.fileKey
          ? await fetchImage(req.overlayImage.fileKey, true)
          : await fetchImage(req.overlayImage.url, false);
        
        console.log('[PDF] Overlay image fetched successfully');
        
        // Get overlay image metadata
        const overlayMeta = await sharp(overlayBuffer).metadata();
        const overlaySourceW = overlayMeta.width || 1;
        const overlaySourceH = overlayMeta.height || 1;
        
        console.log('[PDF] Overlay source dimensions:', overlaySourceW, 'x', overlaySourceH);
        
        // Calculate overlay dimensions and position
        // overlayImage.scale is relative to banner dimensions (e.g., 0.3 = 30% of banner width)
        // overlayImage.position is percentage-based (0-100) relative to banner area
        
        // Get aspect ratio from overlay metadata or stored value
        const overlayAspectRatio = req.overlayImage.aspectRatio || (overlaySourceW / overlaySourceH);
        console.log('[PDF] Overlay aspect ratio:', overlayAspectRatio);
        
        // Calculate overlay dimensions matching BannerEditorLayout.tsx logic:
        // - defaultWidthInches = 4
        // - widthInches = defaultWidthInches * scale (e.g., 4 * 6 = 24 inches)
        // - heightInches = widthInches / aspectRatio
        const defaultWidthInches = 4;
        const overlayWidthIn = defaultWidthInches * req.overlayImage.scale;
        const overlayHeightIn = overlayWidthIn / overlayAspectRatio;
        
        console.log('[PDF] Overlay size in inches:', overlayWidthIn, 'x', overlayHeightIn);
        
        // Convert to pixels at target DPI
        let overlayWidthPx = Math.round(overlayWidthIn * targetDpi);
        let overlayHeightPx = Math.round(overlayHeightIn * targetDpi);
        
        // Safety limit: cap overlay to banner size to prevent memory issues
        const maxWidthPx = req.bannerWidthIn * targetDpi * 1.5;
        const maxHeightPx = req.bannerHeightIn * targetDpi * 1.5;
        if (overlayWidthPx > maxWidthPx || overlayHeightPx > maxHeightPx) {
          const scaleFactor = Math.min(maxWidthPx / overlayWidthPx, maxHeightPx / overlayHeightPx);
          overlayWidthPx = Math.round(overlayWidthPx * scaleFactor);
          overlayHeightPx = Math.round(overlayHeightPx * scaleFactor);
          console.log('[PDF] Overlay capped to prevent memory issues:', overlayWidthPx, 'x', overlayHeightPx);
        }
        
        console.log('[PDF] Overlay target dimensions:', overlayWidthPx, 'x', overlayHeightPx, 'px');
        
        // Position is percentage-based (0-100) and represents the CENTER of the overlay
        // Convert to pixel coordinates on the final canvas (which includes bleed)
        const bannerAreaWidthPx = req.bannerWidthIn * targetDpi;
        const bannerAreaHeightPx = req.bannerHeightIn * targetDpi;
        const bleedPx = bleedIn * targetDpi;
        
        // Calculate center position of overlay within banner area
        const overlayCenterX = (req.overlayImage.position.x / 100) * bannerAreaWidthPx;
        const overlayCenterY = (req.overlayImage.position.y / 100) * bannerAreaHeightPx;
        
        // Convert to top-left position (accounting for bleed offset)
        const overlayLeft = Math.round(bleedPx + overlayCenterX - (overlayWidthPx / 2));
        const overlayTop = Math.round(bleedPx + overlayCenterY - (overlayHeightPx / 2));
        
        console.log('[PDF] Overlay position on canvas:', overlayLeft, ',', overlayTop);
        
        // Resize overlay to target dimensions while maintaining aspect ratio
        const overlayResized = await sharp(overlayBuffer)
          .resize(overlayWidthPx, overlayHeightPx, {
            fit: 'contain', // Maintain aspect ratio
            background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
          })
          .toBuffer();
        
        console.log('[PDF] Overlay resized successfully');
        
        // Add overlay to composite layers
        compositeLayers.push({
          input: overlayResized,
          top: overlayTop,
          left: overlayLeft,
        });
        
        console.log('[PDF] ✅ Overlay added to composite layers');
        console.log('[PDF] Total composite layers:', compositeLayers.length);
        console.log('[PDF] Overlay layer details:', {
          top: overlayTop,
          left: overlayLeft,
          width: overlayWidthPx,
          height: overlayHeightPx
        });
      } catch (overlayError) {
        console.error('[PDF] Error processing overlay image:', overlayError);
        console.error('[PDF] Continuing without overlay...');
        // Continue without overlay - don't fail the entire PDF generation
      }
    }

    // Process multiple overlay images (overlayImages array)
    if (req.overlayImages && Array.isArray(req.overlayImages) && req.overlayImages.length > 0) {
      console.log('[PDF] Processing multiple overlay images:', req.overlayImages.length);
      
      for (let i = 0; i < req.overlayImages.length; i++) {
        const overlay = req.overlayImages[i];
        console.log('[PDF] Processing overlay image', i + 1, ':', overlay.name);
        
        if (!overlay.url && !overlay.fileKey) {
          console.warn('[PDF] Skipping overlay', i + 1, '- no url or fileKey');
          continue;
        }
        
        try {
          // Fetch overlay image from Cloudinary
          const overlayBuffer = overlay.fileKey
            ? await fetchImage(overlay.fileKey, true)
            : await fetchImage(overlay.url, false);
          
          // Get overlay image metadata
          const overlayMeta = await sharp(overlayBuffer).metadata();
          const overlaySourceW = overlayMeta.width || 1;
          const overlaySourceH = overlayMeta.height || 1;
          
          // Calculate overlay dimensions matching BannerEditorLayout.tsx logic:
          // - defaultWidthInches = 4
          // - widthInches = defaultWidthInches * scale (e.g., 4 * 6 = 24 inches)
          // - heightInches = widthInches / aspectRatio
          const overlayAspectRatio = overlay.aspectRatio || (overlaySourceW / overlaySourceH);
          const defaultWidthInches = 4;
          const overlayWidthIn = defaultWidthInches * overlay.scale;
          const overlayHeightIn = overlayWidthIn / overlayAspectRatio;
          
          // Convert to pixels at target DPI
          let overlayWidthPx = Math.round(overlayWidthIn * targetDpi);
          let overlayHeightPx = Math.round(overlayHeightIn * targetDpi);
          
          // Safety limit: cap overlay to banner size to prevent memory issues
          const maxWidthPx = req.bannerWidthIn * targetDpi * 1.5;
          const maxHeightPx = req.bannerHeightIn * targetDpi * 1.5;
          if (overlayWidthPx > maxWidthPx || overlayHeightPx > maxHeightPx) {
            const scaleFactor = Math.min(maxWidthPx / overlayWidthPx, maxHeightPx / overlayHeightPx);
            overlayWidthPx = Math.round(overlayWidthPx * scaleFactor);
            overlayHeightPx = Math.round(overlayHeightPx * scaleFactor);
            console.log('[PDF] Overlay', i + 1, 'capped:', overlayWidthPx, 'x', overlayHeightPx);
          }
          
          // Position is percentage-based (0-100) and represents the CENTER of the overlay
          const bannerAreaWidthPx = req.bannerWidthIn * targetDpi;
          const bannerAreaHeightPx = req.bannerHeightIn * targetDpi;
          const bleedPx = bleedIn * targetDpi;
          
          const overlayCenterX = (overlay.position.x / 100) * bannerAreaWidthPx;
          const overlayCenterY = (overlay.position.y / 100) * bannerAreaHeightPx;
          
          const overlayLeft = Math.round(bleedPx + overlayCenterX - (overlayWidthPx / 2));
          const overlayTop = Math.round(bleedPx + overlayCenterY - (overlayHeightPx / 2));
          
          // Resize overlay to target dimensions
          const overlayResized = await sharp(overlayBuffer)
            .resize(overlayWidthPx, overlayHeightPx, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toBuffer();
          
          // Add overlay to composite layers
          compositeLayers.push({
            input: overlayResized,
            top: overlayTop,
            left: overlayLeft,
          });
          
          console.log('[PDF] ✅ Overlay', i + 1, 'added at', overlayLeft, ',', overlayTop);
        } catch (overlayError) {
          console.error('[PDF] Error processing overlay image', i + 1, ':', overlayError);
          // Continue with other overlays
        }
      }
    }

    const merged = await sharp(whiteCanvas)
      .composite(compositeLayers)
      .jpeg({ quality: 85, chromaSubsampling: '4:2:0', progressive: true }) // JPEG compression to reduce PDF size below 6MB limit
      .toBuffer();

    console.log('[PDF] Image composited onto canvas (with overlay if provided)');

    const pdfBuffer = await rasterToPdfBuffer(merged, finalWidthIn, finalHeightIn, req.textElements, req.bannerWidthIn, req.bannerHeightIn, req.previewCanvasPx, bleedIn);
    console.log(`[PDF] PDF generated: ${pdfBuffer.length} bytes`);

    // Return PDF directly as binary response
    console.log('[PDF] Returning PDF as binary response');
    console.log('[PDF] === PDF render complete ===');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="order-${req.orderId}-print-ready.pdf"`,
        'X-PDF-DPI': targetDpi.toString(),
        'X-PDF-Bleed': bleedIn.toString(),
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true,
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
