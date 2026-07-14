/**
 * Admin print PDF download endpoint.
 *
 * Loads the authoritative order item, upgrades legacy /design state to a
 * versioned print scene, and returns PDF bytes directly. Uploaded PDFs are
 * embedded from their original production asset by render-order-pdf.
 */
const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');
const crypto = require('crypto');
const { RENDERER_VERSION } = require('./_shared/print-scene-renderer.cjs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
const sql = databaseUrl ? neon(databaseUrl) : null;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hashScene(scene) {
  return crypto.createHash('sha256').update(JSON.stringify(scene)).digest('hex');
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function legacyDesignStateToPrintScene(state, fallback = {}) {
  if (!state || state.sceneVersion === 2) return state;
  if (state.source !== 'design-page' || finiteNumber(state.version, 0) < 2) return null;

  const widthIn = finiteNumber(state.widthIn, finiteNumber(fallback.widthIn, 0));
  const heightIn = finiteNumber(state.heightIn, finiteNumber(fallback.heightIn, 0));
  const originalUrl = state.productionUrl || state.originalImageUrl || fallback.fileUrl || null;
  const publicId = state.productionPublicId || state.originalImageFileKey || fallback.fileKey || null;
  if (!widthIn || !heightIn || !originalUrl || !publicId) return null;

  const originalWidth = finiteNumber(state.originalWidth, 0);
  const originalHeight = finiteNumber(state.originalHeight, 0);
  const bannerAspect = widthIn / heightIn;
  const sourceAspect = originalWidth > 0 && originalHeight > 0
    ? originalWidth / originalHeight
    : bannerAspect;

  let containedWidthIn;
  let containedHeightIn;
  if (sourceAspect > bannerAspect) {
    containedWidthIn = widthIn;
    containedHeightIn = widthIn / sourceAspect;
  } else {
    containedHeightIn = heightIn;
    containedWidthIn = heightIn * sourceAspect;
  }

  const scaleX = Math.max(0.0001, finiteNumber(state.imgScale, 1));
  const scaleY = Math.max(0.0001, finiteNumber(state.imgScaleY, scaleX));
  const position = state.imgPos && typeof state.imgPos === 'object'
    ? state.imgPos
    : { x: 0, y: 0 };
  const posXIn = (finiteNumber(position.x, 0) / 100) * widthIn;
  const posYIn = (finiteNumber(position.y, 0) / 100) * heightIn;
  const offsetXIn = (widthIn - containedWidthIn) / 2;
  const offsetYIn = (heightIn - containedHeightIn) / 2;

  const placedWidthIn = containedWidthIn * scaleX;
  const placedHeightIn = containedHeightIn * scaleY;
  const xIn = (widthIn / 2) + posXIn + scaleX * (offsetXIn - widthIn / 2);
  const yIn = (heightIn / 2) + posYIn + scaleY * (offsetYIn - heightIn / 2);

  const isPdf = Boolean(state.isPdf)
    || String(state.mimeType || '').toLowerCase() === 'application/pdf'
    || String(state.originalFormat || '').toLowerCase() === 'pdf'
    || /\.pdf(?:$|\?)/i.test(originalUrl);

  return {
    sceneVersion: 2,
    widthIn,
    heightIn,
    backgroundColor: state.bgColor || fallback.backgroundColor || '#fafafa',
    objects: [{
      id: 'customer-artwork',
      type: 'image',
      xIn,
      yIn,
      widthIn: placedWidthIn,
      heightIn: placedHeightIn,
      rotation: 0,
      opacity: 1,
      visible: true,
      zIndex: 0,
      source: {
        originalUrl,
        publicId,
        resourceType: state.resourceType || (isPdf ? 'raw' : 'image'),
        mimeType: state.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'),
        format: state.originalFormat || (isPdf ? 'pdf' : 'jpg'),
        originalWidth: originalWidth || null,
        originalHeight: originalHeight || null,
        pdfPageNumber: finiteNumber(state.pdfPageNumber, 1),
        isVector: isPdf,
      },
    }],
  };
}

function normalizeCanvasState(canvasStateJson, fallback) {
  const parsed = parseJson(canvasStateJson);
  if (!parsed) return null;
  if (parsed.sceneVersion === 2) return parsed;
  return legacyDesignStateToPrintScene(parsed, fallback) || parsed;
}

async function ensurePrintPdfCacheColumns() {
  if (!sql) return false;
  try {
    await sql`
      ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS generated_print_pdf_url TEXT,
      ADD COLUMN IF NOT EXISTS generated_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS generated_print_pdf_renderer_version TEXT,
      ADD COLUMN IF NOT EXISTS generated_print_pdf_scene_hash TEXT,
      ADD COLUMN IF NOT EXISTS generated_print_pdf_metadata JSONB
    `;
    return true;
  } catch (error) {
    console.warn('[ADMIN_PRINT_PDF] cache-column migration unavailable; continuing without cache:', error && error.message);
    return false;
  }
}

async function loadOrderItem(itemId) {
  if (!sql || !itemId) return null;

  const cacheColumnsReady = await ensurePrintPdfCacheColumns();
  if (cacheColumnsReady) {
    try {
      const rows = await sql`
        SELECT id, width_in, height_in, file_key, file_url, print_ready_url, web_preview_url,
               text_elements, overlay_image, overlay_images, canvas_background_color,
               image_scale, image_position, thumbnail_url,
               final_render_url, final_render_file_key, final_render_width_px,
               final_render_height_px, final_render_dpi, canvas_state_json,
               generated_print_pdf_url, generated_print_pdf_renderer_version,
               generated_print_pdf_scene_hash
        FROM order_items
        WHERE id = ${itemId}
        LIMIT 1
      `;
      return rows && rows[0] ? rows[0] : null;
    } catch (error) {
      const missingColumn = error && (
        error.code === '42703'
        || String(error.message || '').includes('generated_print_pdf_')
      );
      if (!missingColumn) throw error;
      console.warn('[ADMIN_PRINT_PDF] cache columns still unavailable after migration; using no-cache query');
    }
  }

  const rows = await sql`
    SELECT id, width_in, height_in, file_key, file_url, print_ready_url, web_preview_url,
           text_elements, overlay_image, overlay_images, canvas_background_color,
           image_scale, image_position, thumbnail_url,
           final_render_url, final_render_file_key, final_render_width_px,
           final_render_height_px, final_render_dpi, canvas_state_json
    FROM order_items
    WHERE id = ${itemId}
    LIMIT 1
  `;
  if (!rows || !rows[0]) return null;
  return {
    ...rows[0],
    generated_print_pdf_url: null,
    generated_print_pdf_renderer_version: null,
    generated_print_pdf_scene_hash: null,
  };
}

function parseCloudinaryUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'cloudinary.com' || host.endsWith('.cloudinary.com'))) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4) return null;
    const resourceType = segments[1] || 'raw';
    const deliveryType = segments[2] || 'upload';
    const rest = segments.slice(3).filter((segment) => !/^v\d+$/.test(segment));
    const publicIdWithExtension = rest.join('/');
    const dot = publicIdWithExtension.lastIndexOf('.');
    return {
      resourceType,
      deliveryType,
      publicId: dot > -1 ? publicIdWithExtension.slice(0, dot) : publicIdWithExtension,
      format: dot > -1 ? publicIdWithExtension.slice(dot + 1) : 'pdf',
    };
  } catch {
    return null;
  }
}

async function fetchPdfBuffer(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    // Continue to signed fallback.
  }

  const parsed = parseCloudinaryUrl(url);
  if (!parsed || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return null;
  try {
    const signedUrl = cloudinary.utils.private_download_url(parsed.publicId, parsed.format || 'pdf', {
      resource_type: parsed.resourceType || 'raw',
      type: parsed.deliveryType || 'upload',
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + 600,
    });
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function renderFreshPdf(req) {
  const renderModule = require('./render-order-pdf.cjs');
  const response = await renderModule.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...req,
      format: 'pdf',
      forceRegenerate: true,
      cachedPdfUrl: null,
      generatedPrintPdfUrl: null,
    }),
    isBase64Encoded: false,
  });

  if (!response || response.statusCode >= 400) {
    throw new Error(`render-order-pdf returned ${response ? response.statusCode : 'no status'}: ${String(response && response.body ? response.body : '').slice(0, 500)}`);
  }

  const result = JSON.parse(response.body || '{}');
  if (result.error) throw new Error(result.message || result.error);
  if (result.pdfBase64) return Buffer.from(result.pdfBase64, 'base64');

  const url = result.pdfUrl || result.downloadUrl;
  const buffer = await fetchPdfBuffer(url);
  if (!buffer || !buffer.length) {
    throw new Error('Production PDF renderer returned no downloadable PDF bytes.');
  }
  return buffer;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let req;
  try {
    req = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  if (!req.orderId) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'orderId is required' }),
    };
  }

  try {
    const item = await loadOrderItem(req.itemId);

    if (item) {
      req = {
        ...req,
        itemId: item.id,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        fileKey: item.file_key || req.fileKey || null,
        imageUrl: item.file_url || item.web_preview_url || req.imageUrl || null,
        canvasBackgroundColor: item.canvas_background_color || req.canvasBackgroundColor || '#fafafa',
        imageScale: item.image_scale == null ? (req.imageScale == null ? 1 : req.imageScale) : item.image_scale,
        imagePosition: item.image_position || req.imagePosition || { x: 0, y: 0 },
        thumbnailUrl: item.thumbnail_url || req.thumbnailUrl || null,
        finalRenderUrl: item.final_render_url || req.finalRenderUrl || null,
        finalRenderFileKey: item.final_render_file_key || req.finalRenderFileKey || null,
        finalRenderWidthPx: item.final_render_width_px || req.finalRenderWidthPx || null,
        finalRenderHeightPx: item.final_render_height_px || req.finalRenderHeightPx || null,
        finalRenderDpi: item.final_render_dpi || req.finalRenderDpi || null,
        textElements: item.text_elements || req.textElements || [],
        overlayImage: item.overlay_image || req.overlayImage || null,
      };

      const normalizedScene = normalizeCanvasState(item.canvas_state_json || req.canvasStateJson, {
        widthIn: item.width_in,
        heightIn: item.height_in,
        fileUrl: item.file_url,
        fileKey: item.file_key,
        backgroundColor: item.canvas_background_color,
      });
      if (normalizedScene) req.canvasStateJson = JSON.stringify(normalizedScene);

      const expectedHash = normalizedScene && normalizedScene.sceneVersion === 2
        ? hashScene(normalizedScene)
        : null;
      const cacheMatches = Boolean(
        item.generated_print_pdf_url
        && expectedHash
        && item.generated_print_pdf_renderer_version === RENDERER_VERSION
        && item.generated_print_pdf_scene_hash === expectedHash
      );

      if (cacheMatches) {
        const cachedBuffer = await fetchPdfBuffer(item.generated_print_pdf_url);
        if (cachedBuffer && cachedBuffer.length) {
          return {
            statusCode: 200,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="order-${req.orderId}-print.pdf"`,
              'Cache-Control': 'no-store',
              'X-Print-PDF-Source': 'cached-vector',
            },
            isBase64Encoded: true,
            body: cachedBuffer.toString('base64'),
          };
        }
      }
    } else {
      const normalizedScene = normalizeCanvasState(req.canvasStateJson, {
        widthIn: req.bannerWidthIn,
        heightIn: req.bannerHeightIn,
        fileUrl: req.imageUrl,
        fileKey: req.fileKey,
        backgroundColor: req.canvasBackgroundColor,
      });
      if (normalizedScene) req.canvasStateJson = JSON.stringify(normalizedScene);
    }

    const pdfBuffer = await renderFreshPdf(req);
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="order-${req.orderId}-print.pdf"`,
        'Cache-Control': 'no-store',
        'X-Print-PDF-Source': 'regenerated-vector',
      },
      isBase64Encoded: true,
      body: pdfBuffer.toString('base64'),
    };
  } catch (error) {
    console.error('[ADMIN_PRINT_PDF] generation failed:', error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error && error.message ? error.message : 'Failed to produce print PDF',
      }),
    };
  }
};

exports._test = {
  legacyDesignStateToPrintScene,
  normalizeCanvasState,
  hashScene,
};
