/**
 * Canonical production print-PDF endpoint.
 *
 * PDF artwork is always composed from the original uploaded PDF page and saved
 * designer transforms. It is never served from a PNG/JPEG preview or an older
 * rasterized PDF cache. Raster artwork continues through the legacy renderer.
 */
const { neon } = require('@neondatabase/serverless');
const {
  parseDesignState,
  isPdfDesignState,
  renderVectorDesignStatePdf,
} = require('./_shared/vector-design-state-pdf.cjs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL || '';
const sql = databaseUrl ? neon(databaseUrl) : null;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function pdfResponse(buffer, orderId, source, extraHeaders = {}) {
  const safeOrderId = String(orderId || 'order').replace(/[^A-Za-z0-9_-]/g, '');
  const vectorSuffix = source === 'vector-original-pdf' ? '-VECTOR' : '';
  const filename = `order-${safeOrderId.slice(-8) || safeOrderId}-print${vectorSuffix}.pdf`;
  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Print-PDF-Source': source,
      ...extraHeaders,
    },
    body: buffer.toString('base64'),
    isBase64Encoded: true,
  };
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function looksLikePdf(...values) {
  return values.some((value) => {
    if (value === true) return true;
    if (!value) return false;
    const normalized = String(value).trim().toLowerCase().split('?')[0].split('#')[0];
    return normalized === 'pdf'
      || normalized === 'application/pdf'
      || normalized.endsWith('.pdf');
  });
}

function mergeDesignState(request, row) {
  const parsed = parseDesignState(request.canvasStateJson || row?.canvas_state_json) || {};
  const overlay = row?.overlay_image && typeof row.overlay_image === 'object' ? row.overlay_image : null;
  const originalImageUrl = parsed.originalImageUrl
    || row?.file_url
    || overlay?.originalUrl
    || overlay?.url
    || request.imageUrl
    || null;
  const originalImageFileKey = parsed.originalImageFileKey
    || row?.file_key
    || overlay?.fileKey
    || request.fileKey
    || null;
  const pdf = isPdfDesignState(parsed)
    || looksLikePdf(parsed.isPdf, parsed.originalFormat, originalImageUrl, originalImageFileKey, request.imageUrl, request.fileKey);

  const imagePosition = parsed.imgPos
    || parsed.position
    || row?.image_position
    || request.imagePosition
    || { x: 0, y: 0 };
  const imageScale = parsed.imgScale
    ?? parsed.scaleX
    ?? row?.image_scale
    ?? request.imageScale
    ?? 1;
  const imageScaleY = parsed.imgScaleY
    ?? parsed.scaleY
    ?? row?.image_scale_y
    ?? request.imageScaleY
    ?? imageScale;

  return {
    ...parsed,
    source: parsed.source || 'order-item-production-rebuild',
    version: parsed.version || 1,
    originalImageUrl,
    originalImageFileKey,
    isPdf: pdf,
    widthIn: asNumber(request.bannerWidthIn || row?.width_in || parsed.widthIn, 0),
    heightIn: asNumber(request.bannerHeightIn || row?.height_in || parsed.heightIn, 0),
    imgPos: {
      x: asNumber(imagePosition?.x, 0),
      y: asNumber(imagePosition?.y, 0),
    },
    imgScale: asNumber(imageScale, 1),
    imgScaleY: asNumber(imageScaleY, asNumber(imageScale, 1)),
    fitMode: parsed.fitMode || request.fitMode || 'fit',
    bgColor: parsed.bgColor || parsed.backgroundColor || row?.canvas_background_color || request.canvasBackgroundColor || '#fafafa',
  };
}

async function loadOrderItem(request, log) {
  if (!sql) {
    log('database unavailable; using request payload only');
    return null;
  }

  try {
    if (request.itemId) {
      const rows = await sql`
        SELECT id, order_id, width_in, height_in, file_key, file_url,
               canvas_state_json, image_scale, image_position,
               canvas_background_color, overlay_image,
               generated_print_pdf_url, final_print_pdf_url, product_type
          FROM order_items
         WHERE id = ${request.itemId}
         LIMIT 1
      `;
      return rows?.[0] || null;
    }

    if (request.orderId && Number.isInteger(Number(request.itemIndex))) {
      const rows = await sql`
        SELECT id, order_id, width_in, height_in, file_key, file_url,
               canvas_state_json, image_scale, image_position,
               canvas_background_color, overlay_image,
               generated_print_pdf_url, final_print_pdf_url, product_type
          FROM order_items
         WHERE order_id = ${request.orderId}
         ORDER BY id ASC
      `;
      return rows?.[Number(request.itemIndex)] || null;
    }
  } catch (error) {
    log('order-item hydration failed; using request payload', error?.message || String(error));
  }

  return null;
}

async function clearRasterCache(itemId, log) {
  if (!sql || !itemId) return;
  try {
    await sql`
      UPDATE order_items
         SET generated_print_pdf_url = NULL,
             generated_print_pdf_uploaded_at = NULL
       WHERE id = ${itemId}
    `;
    log('cleared old generated raster-PDF cache for vector artwork');
  } catch (error) {
    log('could not clear old generated PDF cache (non-fatal)', error?.message || String(error));
  }
}

async function fetchPdfUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Generated PDF download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const signature = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  if (!signature.includes('%PDF-')) throw new Error('Generated print response was not a PDF');
  return buffer;
}

async function renderLegacyPdf(requestBody, log) {
  const renderModule = require('./render-order-pdf.cjs');
  if (!renderModule || typeof renderModule.handler !== 'function') {
    throw new Error('Legacy print renderer is unavailable');
  }

  const renderRequest = {
    ...(requestBody || {}),
    format: 'pdf',
    forceRegenerate: true,
    cachedPdfUrl: null,
    generatedPrintPdfUrl: null,
  };

  log('invoking legacy render-order-pdf for raster artwork');
  const result = await renderModule.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(renderRequest),
    isBase64Encoded: false,
  }, {});

  if (!result || result.statusCode >= 400) {
    const detail = result?.body ? String(result.body).slice(0, 800) : 'empty response';
    throw new Error(`render-order-pdf returned ${result?.statusCode || 'no status'}: ${detail}`);
  }

  let payload;
  try {
    payload = JSON.parse(result.body || '{}');
  } catch {
    throw new Error('render-order-pdf returned invalid JSON');
  }

  if (payload.error) throw new Error(String(payload.error));
  if (payload.pdfBase64) {
    const buffer = Buffer.from(payload.pdfBase64, 'base64');
    if (!buffer.length) throw new Error('Generated print PDF was empty');
    return buffer;
  }
  if (payload.pdfUrl || payload.downloadUrl) {
    return fetchPdfUrl(payload.pdfUrl || payload.downloadUrl);
  }

  throw new Error('Print renderer returned no PDF data');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'INVALID_JSON', message: 'Invalid request body.' });
  }

  const orderId = request.orderId;
  if (!orderId) return json(400, { error: 'ORDER_ID_REQUIRED', message: 'orderId is required.' });

  const log = (...args) => console.log('[PRODUCTION_PRINT_PDF]', `order=${orderId}`, ...args);
  const row = await loadOrderItem(request, log);
  const designState = mergeDesignState(request, row);
  const pdfArtwork = isPdfDesignState(designState)
    || looksLikePdf(designState.originalImageUrl, designState.originalImageFileKey);

  log('resolved print source', {
    itemId: request.itemId || row?.id || null,
    hasStoredCanvasState: !!row?.canvas_state_json,
    hasRequestCanvasState: !!request.canvasStateJson,
    originalPdf: pdfArtwork,
    widthIn: designState.widthIn,
    heightIn: designState.heightIn,
    source: designState.source,
  });

  if (pdfArtwork) {
    if (!designState.widthIn || !designState.heightIn) {
      return json(422, {
        error: 'VECTOR_PRINT_DIMENSIONS_MISSING',
        message: 'The saved banner dimensions are missing, so a production PDF cannot be composed safely.',
      });
    }
    if (!designState.originalImageUrl && !designState.originalImageFileKey) {
      return json(422, {
        error: 'VECTOR_PRINT_SOURCE_MISSING',
        message: 'The original uploaded PDF reference is missing. The system will not substitute a blurry preview.',
      });
    }

    try {
      await clearRasterCache(request.itemId || row?.id, log);
      const rendered = await renderVectorDesignStatePdf({
        designState,
        bannerWidthIn: designState.widthIn,
        bannerHeightIn: designState.heightIn,
        bleedIn: request.includeBleed === false ? 0 : asNumber(request.bleedIn, 0),
      });
      log('vector PDF complete', rendered.metadata);
      return pdfResponse(rendered.buffer, orderId, 'vector-original-pdf', {
        'X-Original-Artwork-Vector': 'true',
        'X-Vector-Renderer': rendered.metadata.renderer,
        'X-Vector-Source-Width-Pt': String(rendered.metadata.sourcePageWidthPt),
        'X-Vector-Source-Height-Pt': String(rendered.metadata.sourcePageHeightPt),
      });
    } catch (error) {
      console.error('[PRODUCTION_PRINT_PDF] vector composition failed:', error?.stack || error);
      return json(422, {
        error: 'VECTOR_PRINT_PDF_FAILED',
        message: 'The original PDF could not be composed into the production file without rasterization.',
        details: error?.message || String(error),
      });
    }
  }

  try {
    const buffer = await renderLegacyPdf({
      ...request,
      itemId: request.itemId || row?.id || null,
      bannerWidthIn: request.bannerWidthIn || row?.width_in,
      bannerHeightIn: request.bannerHeightIn || row?.height_in,
      canvasStateJson: request.canvasStateJson || row?.canvas_state_json || null,
      fileKey: request.fileKey || row?.file_key || null,
      imageUrl: request.imageUrl || row?.file_url || null,
    }, log);
    return pdfResponse(buffer, orderId, 'regenerated-raster-artwork');
  } catch (error) {
    console.error('[PRODUCTION_PRINT_PDF] raster generation failed:', error?.stack || error);
    return json(500, {
      error: 'PRINT_PDF_GENERATION_FAILED',
      message: error?.message || 'Failed to generate print PDF.',
    });
  }
};
