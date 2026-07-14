/**
 * Admin print PDF download endpoint.
 *
 * Native sceneVersion 2 orders use the vector production renderer.
 * Simple legacy orders are rebuilt from the original production asset with
 * contain-fit, preserving full resolution and preventing crop. Legacy orders
 * with added text/overlays use the saved approved snapshot because it is the
 * only authoritative record of the composed design.
 */
const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');
const crypto = require('crypto');
const { PDFDocument, rgb } = require('pdf-lib');
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
  try { return JSON.parse(value); } catch { return null; }
}

function hashScene(scene) {
  return crypto.createHash('sha256').update(JSON.stringify(scene)).digest('hex');
}

function isTemporaryUrl(value) {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));
}

function isRawPdfUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && (
    /\.pdf(?:$|[?#])/.test(normalized)
    || normalized.includes('/raw/upload/')
    || normalized.startsWith('application/pdf')
  );
}

function isUsableAssetUrl(value) {
  return typeof value === 'string' && value.trim().length > 0 && !isTemporaryUrl(value);
}

function isUsableSnapshotUrl(value) {
  return isUsableAssetUrl(value) && !isRawPdfUrl(value);
}

function getLegacyApprovedSnapshot(item = {}, req = {}) {
  return [
    item.final_render_url,
    item.web_preview_url,
    item.thumbnail_url,
    item.print_ready_url,
    req.finalRenderUrl,
    req.webPreviewUrl,
    req.thumbnailUrl,
    req.printReadyUrl,
  ].find(isUsableSnapshotUrl) || null;
}

function hasEntries(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function hasLegacyComposedLayers(item = {}, req = {}, parsedState = null) {
  return hasEntries(item.text_elements)
    || hasEntries(item.overlay_image)
    || hasEntries(item.overlay_images)
    || hasEntries(req.textElements)
    || hasEntries(req.overlayImage)
    || hasEntries(req.overlayImages)
    || hasEntries(parsedState?.textElements)
    || hasEntries(parsedState?.overlayImage)
    || hasEntries(parsedState?.overlayImages)
    || (parsedState?.source === 'banner-editor' && hasEntries(parsedState?.objects));
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    const clean = String(url || '').split(/[?#]/)[0];
    const match = clean.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  }
}

function getLegacyOriginalAsset(item = {}, req = {}, parsedState = null) {
  const url = parsedState?.productionUrl
    || parsedState?.originalImageUrl
    || item.file_url
    || req.imageUrl
    || null;
  const publicId = parsedState?.productionPublicId
    || parsedState?.originalImageFileKey
    || item.file_key
    || req.fileKey
    || null;
  const format = String(
    parsedState?.originalFormat
    || extensionFromUrl(url)
    || '',
  ).replace(/^\./, '').toLowerCase() || null;
  const mimeType = parsedState?.mimeType || (format === 'pdf' ? 'application/pdf' : null);
  const isPdf = Boolean(parsedState?.isPdf)
    || mimeType === 'application/pdf'
    || format === 'pdf'
    || isRawPdfUrl(url);
  const resourceType = parsedState?.resourceType || (isPdf ? 'raw' : 'image');

  let resolvedUrl = isUsableAssetUrl(url) ? url : null;
  if (!resolvedUrl && publicId) {
    resolvedUrl = cloudinary.url(publicId, {
      secure: true,
      resource_type: resourceType,
      ...(format ? { format } : {}),
    });
  }
  if (!resolvedUrl) return null;

  return { url: resolvedUrl, publicId, format, mimeType, resourceType, isPdf };
}

function parseCloudinaryUrl(url, source = {}) {
  let publicId = source.publicId || null;
  let resourceType = source.resourceType || null;
  let format = source.format || null;
  let deliveryType = 'upload';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'cloudinary.com' || host.endsWith('.cloudinary.com'))) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length >= 4) {
      resourceType = resourceType || segments[1] || 'image';
      deliveryType = segments[2] || 'upload';
      const assetSegments = segments.slice(3).filter((segment) => !/^v\d+$/.test(segment));
      const publicIdWithExtension = assetSegments.join('/');
      const dot = publicIdWithExtension.lastIndexOf('.');
      if (!publicId) publicId = dot > -1 ? publicIdWithExtension.slice(0, dot) : publicIdWithExtension;
      if (!format && dot > -1) format = publicIdWithExtension.slice(dot + 1).toLowerCase();
    }
  } catch {
    return null;
  }
  if (publicId && format && publicId.toLowerCase().endsWith(`.${format}`)) {
    publicId = publicId.slice(0, -(format.length + 1));
  }
  return publicId ? { publicId, resourceType: resourceType || 'image', format, deliveryType } : null;
}

async function fetchAssetBuffer(url, source = {}) {
  let directStatus = 0;
  try {
    const response = await fetch(url);
    directStatus = response.status;
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    // Continue to signed Cloudinary fallback.
  }

  const parsed = parseCloudinaryUrl(url, source);
  if (!parsed || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error(`Could not fetch production asset (${directStatus || 'network error'})`);
  }

  const signedUrl = cloudinary.utils.private_download_url(
    parsed.publicId,
    parsed.format || (source.isPdf ? 'pdf' : 'jpg'),
    {
      resource_type: parsed.resourceType || (source.isPdf ? 'raw' : 'image'),
      type: parsed.deliveryType || 'upload',
      attachment: false,
      expires_at: Math.floor(Date.now() / 1000) + 600,
    },
  );
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`Signed production asset fetch returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function colorFromHex(value) {
  const clean = String(value || '#ffffff').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, 'f').slice(0, 6);
  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
}

function looksLikePng(buffer) {
  return buffer?.length >= 8
    && buffer[0] === 0x89 && buffer[1] === 0x50
    && buffer[2] === 0x4e && buffer[3] === 0x47;
}

function looksLikePdf(buffer) {
  return buffer?.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
}

async function createLegacyOriginalContainPdf(asset, widthIn, heightIn, backgroundColor) {
  const widthPt = Number(widthIn) * 72;
  const heightPt = Number(heightIn) * 72;
  if (!widthPt || !heightPt) throw new Error('Invalid legacy order dimensions');

  const buffer = await fetchAssetBuffer(asset.url, asset);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([widthPt, heightPt]);
  page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: colorFromHex(backgroundColor) });

  let embedded;
  let sourceWidth;
  let sourceHeight;
  if (asset.isPdf || looksLikePdf(buffer)) {
    [embedded] = await pdfDoc.embedPdf(buffer, [0]);
    sourceWidth = embedded.width;
    sourceHeight = embedded.height;
  } else if (looksLikePng(buffer) || asset.format === 'png') {
    embedded = await pdfDoc.embedPng(buffer);
    sourceWidth = embedded.width;
    sourceHeight = embedded.height;
  } else {
    embedded = await pdfDoc.embedJpg(buffer);
    sourceWidth = embedded.width;
    sourceHeight = embedded.height;
  }

  const scale = Math.min(widthPt / sourceWidth, heightPt / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (widthPt - drawWidth) / 2;
  const y = (heightPt - drawHeight) / 2;

  if (asset.isPdf || looksLikePdf(buffer)) {
    page.drawPage(embedded, { x, y, width: drawWidth, height: drawHeight });
  } else {
    page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
  }

  return Buffer.from(await pdfDoc.save({ useObjectStreams: true }));
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
    console.warn('[ADMIN_PRINT_PDF] cache-column migration unavailable:', error?.message);
    return false;
  }
}

async function loadOrderItem(itemId) {
  if (!sql || !itemId) return null;
  const cacheReady = await ensurePrintPdfCacheColumns();
  if (cacheReady) {
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
      return rows?.[0] || null;
    } catch (error) {
      if (!(error?.code === '42703' || String(error?.message || '').includes('generated_print_pdf_'))) throw error;
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
  return rows?.[0] ? {
    ...rows[0],
    generated_print_pdf_url: null,
    generated_print_pdf_renderer_version: null,
    generated_print_pdf_scene_hash: null,
  } : null;
}

async function fetchPdfBuffer(url) {
  try { return await fetchAssetBuffer(url); } catch { return null; }
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
    throw new Error(`render-order-pdf returned ${response?.statusCode || 'no status'}: ${String(response?.body || '').slice(0, 500)}`);
  }
  const result = JSON.parse(response.body || '{}');
  if (result.error) throw new Error(result.message || result.error);
  if (result.pdfBase64) return Buffer.from(result.pdfBase64, 'base64');
  const buffer = await fetchPdfBuffer(result.pdfUrl || result.downloadUrl);
  if (!buffer?.length) throw new Error('Production PDF renderer returned no downloadable bytes');
  return buffer;
}

function prepareItemRequest(req, item) {
  const parsedState = parseJson(item.canvas_state_json || req.canvasStateJson);
  const isNativeSceneV2 = parsedState?.sceneVersion === 2;
  const approvedSnapshot = !isNativeSceneV2 ? getLegacyApprovedSnapshot(item, req) : null;
  const originalAsset = !isNativeSceneV2 ? getLegacyOriginalAsset(item, req, parsedState) : null;
  const hasComposedLayers = !isNativeSceneV2 && hasLegacyComposedLayers(item, req, parsedState);

  const next = {
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
    overlayImages: item.overlay_images || req.overlayImages || [],
  };

  if (isNativeSceneV2) {
    next.canvasStateJson = JSON.stringify(parsedState);
    return { req: next, normalizedScene: parsedState, source: 'native-scene-v2', originalAsset: null };
  }

  if (originalAsset && !hasComposedLayers) {
    next.canvasStateJson = null;
    next.finalRenderUrl = null;
    next.finalRenderFileKey = null;
    next.thumbnailUrl = null;
    next.textElements = [];
    next.overlayImage = null;
    next.overlayImages = [];
    return { req: next, normalizedScene: null, source: 'legacy-original-contain', originalAsset };
  }

  if (approvedSnapshot) {
    next.canvasStateJson = null;
    next.finalRenderUrl = approvedSnapshot;
    next.finalRenderFileKey = null;
    next.thumbnailUrl = approvedSnapshot;
    next.imageScale = 1;
    next.imagePosition = { x: 0, y: 0 };
    next.textElements = [];
    next.overlayImage = null;
    next.overlayImages = [];
    return { req: next, normalizedScene: null, source: 'legacy-approved-snapshot', originalAsset: null };
  }

  // Last-resort compatibility path: do not convert ambiguous legacy transforms
  // into scene v2. Let the existing renderer use the raw stored request fields.
  next.canvasStateJson = parsedState ? JSON.stringify(parsedState) : null;
  return { req: next, normalizedScene: null, source: 'legacy-reconstruction', originalAsset: null };
}

function pdfResponse(req, buffer, source) {
  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="order-${req.orderId}-print.pdf"`,
      'Cache-Control': 'no-store',
      'X-Print-PDF-Source': source,
    },
    isBase64Encoded: true,
    body: buffer.toString('base64'),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  if (!req.orderId) {
    return { statusCode: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'orderId is required' }) };
  }

  try {
    const item = await loadOrderItem(req.itemId);
    let normalizedScene = null;
    let selectedSource = 'request-fallback';
    let originalAsset = null;

    if (item) {
      const prepared = prepareItemRequest(req, item);
      req = prepared.req;
      normalizedScene = prepared.normalizedScene;
      selectedSource = prepared.source;
      originalAsset = prepared.originalAsset;

      const expectedHash = normalizedScene?.sceneVersion === 2 ? hashScene(normalizedScene) : null;
      const cacheMatches = Boolean(
        item.generated_print_pdf_url
        && expectedHash
        && item.generated_print_pdf_renderer_version === RENDERER_VERSION
        && item.generated_print_pdf_scene_hash === expectedHash
      );
      if (cacheMatches) {
        const cached = await fetchPdfBuffer(item.generated_print_pdf_url);
        if (cached?.length) return pdfResponse(req, cached, 'cached-vector');
      }
    }

    if (selectedSource === 'legacy-original-contain' && originalAsset) {
      const buffer = await createLegacyOriginalContainPdf(
        originalAsset,
        req.bannerWidthIn,
        req.bannerHeightIn,
        req.canvasBackgroundColor,
      );
      return pdfResponse(req, buffer, selectedSource);
    }

    const buffer = await renderFreshPdf(req);
    return pdfResponse(req, buffer, selectedSource);
  } catch (error) {
    console.error('[ADMIN_PRINT_PDF] generation failed:', error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error?.message || 'Failed to produce print PDF' }),
    };
  }
};

exports._test = {
  hashScene,
  isUsableSnapshotUrl,
  getLegacyApprovedSnapshot,
  getLegacyOriginalAsset,
  hasLegacyComposedLayers,
  prepareItemRequest,
  looksLikePng,
  looksLikePdf,
};
