/**
 * Admin print PDF download endpoint.
 *
 * Native sceneVersion 2 orders continue through the vector production renderer.
 * Legacy orders use the highest-resolution permanent APPROVED snapshot whose
 * aspect ratio matches the ordered banner. The snapshot bytes are embedded
 * directly into the PDF without browser resizing or JPEG recompression.
 */
const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');
const sharp = require('sharp');
const { PDFDocument, rgb } = require('pdf-lib');

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

const APPROVED_ASPECT_TOLERANCE = 0.04;
const FETCH_TIMEOUT_MS = 25_000;

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isTemporaryUrl(value) {
  return typeof value === 'string'
    && (value.startsWith('blob:') || value.startsWith('data:'));
}

function isRawPdfUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && (
    /\.pdf(?:$|[?#])/.test(normalized)
    || normalized.includes('/raw/upload/')
    || normalized.startsWith('application/pdf')
  );
}

function isUsableApprovedSnapshotUrl(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !isTemporaryUrl(value)
    && !isRawPdfUrl(value);
}

function getApprovedSnapshotCandidates(item = {}, request = {}) {
  const candidates = [
    ['final_render', item.final_render_url],
    ['web_preview', item.web_preview_url],
    ['thumbnail', item.thumbnail_url],
    ['print_ready', item.print_ready_url],
    ['request_final_render', request.finalRenderUrl],
    ['request_web_preview', request.webPreviewUrl],
    ['request_thumbnail', request.thumbnailUrl],
    ['request_print_ready', request.printReadyUrl],
  ];

  const seen = new Set();
  return candidates
    .filter(([, url]) => isUsableApprovedSnapshotUrl(url))
    .filter(([, url]) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map(([source, url]) => ({ source, url }));
}

function relativeAspectError(width, height, bannerAspect) {
  if (!width || !height || !bannerAspect) return Number.POSITIVE_INFINITY;
  return Math.abs((width / height) - bannerAspect) / bannerAspect;
}

function isBetterSnapshot(candidate, current) {
  if (!current) return true;
  const candidateMatches = candidate.aspectError <= APPROVED_ASPECT_TOLERANCE;
  const currentMatches = current.aspectError <= APPROVED_ASPECT_TOLERANCE;

  if (candidateMatches !== currentMatches) return candidateMatches;
  if (candidateMatches && currentMatches) {
    if (candidate.area !== current.area) return candidate.area > current.area;
    return candidate.aspectError < current.aspectError;
  }

  if (candidate.aspectError !== current.aspectError) {
    return candidate.aspectError < current.aspectError;
  }
  return candidate.area > current.area;
}

function parseCloudinaryUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'cloudinary.com' || host.endsWith('.cloudinary.com'))) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    const resourceType = parts[1] || 'image';
    const deliveryType = parts[2] || 'upload';
    const afterUpload = parts.slice(3);
    const versionIndex = afterUpload.findIndex((part) => /^v\d+$/.test(part));
    const assetParts = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload;
    const withExtension = assetParts.join('/');
    const dot = withExtension.lastIndexOf('.');
    return {
      resourceType,
      deliveryType,
      publicId: dot > -1 ? withExtension.slice(0, dot) : withExtension,
      format: dot > -1 ? withExtension.slice(dot + 1).toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAssetBuffer(url) {
  let directStatus = 0;
  try {
    const response = await fetchWithTimeout(url);
    directStatus = response.status;
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    // Continue to signed Cloudinary fallback.
  }

  const parsed = parseCloudinaryUrl(url);
  if (!parsed || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error(`Could not fetch approved snapshot (${directStatus || 'network error'})`);
  }

  const signedUrl = cloudinary.utils.private_download_url(
    parsed.publicId,
    parsed.format || 'jpg',
    {
      resource_type: parsed.resourceType || 'image',
      type: parsed.deliveryType || 'upload',
      attachment: false,
      expires_at: Math.floor(Date.now() / 1000) + 600,
    },
  );
  const response = await fetchWithTimeout(signedUrl);
  if (!response.ok) {
    throw new Error(`Signed approved snapshot fetch returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function selectBestApprovedSnapshot(item, request, bannerWidthIn, bannerHeightIn) {
  const bannerAspect = Number(bannerWidthIn) / Number(bannerHeightIn);
  const candidates = getApprovedSnapshotCandidates(item, request);
  let best = null;

  for (const candidate of candidates) {
    try {
      const buffer = await fetchAssetBuffer(candidate.url);
      const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
      const width = Number(metadata.width || 0);
      const height = Number(metadata.height || 0);
      if (!width || !height) continue;

      const evaluated = {
        ...candidate,
        buffer,
        width,
        height,
        format: String(metadata.format || '').toLowerCase(),
        area: width * height,
        aspectError: relativeAspectError(width, height, bannerAspect),
      };
      if (isBetterSnapshot(evaluated, best)) best = evaluated;
    } catch (error) {
      console.warn('[LEGACY_PRINT] approved snapshot candidate failed', {
        source: candidate.source,
        url: candidate.url,
        error: error?.message || String(error),
      });
    }
  }

  if (!best) return null;
  if (best.aspectError > APPROVED_ASPECT_TOLERANCE) {
    throw new Error(
      `No approved legacy snapshot matches the ordered banner aspect ratio. `
      + `Closest source ${best.source} differs by ${(best.aspectError * 100).toFixed(1)}%.`,
    );
  }
  return best;
}

function looksLikeJpeg(buffer) {
  return buffer?.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;
}

function looksLikePng(buffer) {
  return buffer?.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47;
}

function colorFromHex(value) {
  const clean = String(value || '#ffffff').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((character) => character + character).join('')
    : clean.padEnd(6, 'f').slice(0, 6);
  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
}

async function createApprovedSnapshotPdf(snapshot, widthIn, heightIn, backgroundColor) {
  const widthPt = Number(widthIn) * 72;
  const heightPt = Number(heightIn) * 72;
  if (!widthPt || !heightPt) throw new Error('Invalid ordered banner dimensions');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([widthPt, heightPt]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    color: colorFromHex(backgroundColor),
  });

  let embeddedImage;
  if (looksLikeJpeg(snapshot.buffer)) {
    embeddedImage = await pdfDoc.embedJpg(snapshot.buffer);
  } else if (looksLikePng(snapshot.buffer)) {
    embeddedImage = await pdfDoc.embedPng(snapshot.buffer);
  } else {
    // PDFKit cannot embed WebP/AVIF directly. Convert losslessly to PNG without
    // resizing so the approved composition and all available pixels are kept.
    const png = await sharp(snapshot.buffer, { failOn: 'none' }).png().toBuffer();
    embeddedImage = await pdfDoc.embedPng(png);
  }

  // The snapshot is already the approved full banner composition. Draw it over
  // the exact ordered page dimensions. Do not contain/crop/reconstruct it.
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
  });

  return Buffer.from(await pdfDoc.save({ useObjectStreams: true }));
}

async function loadOrderItem(itemId) {
  if (!sql || !itemId) return null;
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
  return rows?.[0] || null;
}

async function fetchPdfBuffer(url) {
  if (!url) return null;
  try {
    const response = await fetchWithTimeout(url);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    // Continue to signed fallback.
  }

  const parsed = parseCloudinaryUrl(url);
  if (!parsed || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return null;
  try {
    const signedUrl = cloudinary.utils.private_download_url(
      parsed.publicId,
      parsed.format || 'pdf',
      {
        resource_type: parsed.resourceType || 'raw',
        type: parsed.deliveryType || 'upload',
        attachment: true,
        expires_at: Math.floor(Date.now() / 1000) + 600,
      },
    );
    const response = await fetchWithTimeout(signedUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function renderThroughProductionRenderer(request) {
  const renderModule = require('./render-order-pdf.cjs');
  const response = await renderModule.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...request,
      format: 'pdf',
      forceRegenerate: true,
      cachedPdfUrl: null,
      generatedPrintPdfUrl: null,
    }),
    isBase64Encoded: false,
  });

  if (!response || response.statusCode >= 400) {
    throw new Error(
      `render-order-pdf returned ${response?.statusCode || 'no status'}: `
      + String(response?.body || '').slice(0, 500),
    );
  }

  const result = JSON.parse(response.body || '{}');
  if (result.error) throw new Error(result.message || result.error);
  if (result.pdfBase64) return Buffer.from(result.pdfBase64, 'base64');
  const buffer = await fetchPdfBuffer(result.pdfUrl || result.downloadUrl);
  if (!buffer?.length) throw new Error('Production renderer returned no downloadable PDF bytes');
  return buffer;
}

function buildAuthoritativeRequest(request, item) {
  return {
    ...request,
    itemId: item.id,
    bannerWidthIn: item.width_in,
    bannerHeightIn: item.height_in,
    fileKey: item.file_key || request.fileKey || null,
    imageUrl: item.file_url || item.web_preview_url || request.imageUrl || null,
    canvasBackgroundColor: item.canvas_background_color || request.canvasBackgroundColor || '#ffffff',
    imageScale: item.image_scale == null ? (request.imageScale ?? 1) : item.image_scale,
    imagePosition: item.image_position || request.imagePosition || { x: 0, y: 0 },
    thumbnailUrl: item.thumbnail_url || request.thumbnailUrl || null,
    finalRenderUrl: item.final_render_url || request.finalRenderUrl || null,
    finalRenderFileKey: item.final_render_file_key || request.finalRenderFileKey || null,
    finalRenderWidthPx: item.final_render_width_px || request.finalRenderWidthPx || null,
    finalRenderHeightPx: item.final_render_height_px || request.finalRenderHeightPx || null,
    finalRenderDpi: item.final_render_dpi || request.finalRenderDpi || null,
    textElements: item.text_elements || request.textElements || [],
    overlayImage: item.overlay_image || request.overlayImage || null,
    overlayImages: item.overlay_images || request.overlayImages || [],
    canvasStateJson: item.canvas_state_json || request.canvasStateJson || null,
    includeBleed: false,
    bleedIn: 0,
  };
}

function pdfResponse(request, buffer, source, metadata = {}) {
  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="order-${request.orderId}-print.pdf"`,
      'Cache-Control': 'no-store',
      'X-Print-PDF-Source': source,
      ...(metadata.width ? { 'X-Approved-Snapshot-Width': String(metadata.width) } : {}),
      ...(metadata.height ? { 'X-Approved-Snapshot-Height': String(metadata.height) } : {}),
    },
    isBase64Encoded: true,
    body: buffer.toString('base64'),
  };
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

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  if (!request.orderId) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'orderId is required' }),
    };
  }

  try {
    const item = await loadOrderItem(request.itemId);
    if (!item) {
      const fallbackBuffer = await renderThroughProductionRenderer(request);
      return pdfResponse(request, fallbackBuffer, 'request-fallback');
    }

    const authoritativeRequest = buildAuthoritativeRequest(request, item);
    const parsedState = parseJson(authoritativeRequest.canvasStateJson);
    const isNativeSceneV2 = parsedState?.sceneVersion === 2;

    if (isNativeSceneV2) {
      authoritativeRequest.canvasStateJson = JSON.stringify(parsedState);
      const vectorBuffer = await renderThroughProductionRenderer(authoritativeRequest);
      return pdfResponse(authoritativeRequest, vectorBuffer, 'native-scene-v2');
    }

    const snapshot = await selectBestApprovedSnapshot(
      item,
      authoritativeRequest,
      authoritativeRequest.bannerWidthIn,
      authoritativeRequest.bannerHeightIn,
    );

    if (snapshot) {
      const snapshotPdf = await createApprovedSnapshotPdf(
        snapshot,
        authoritativeRequest.bannerWidthIn,
        authoritativeRequest.bannerHeightIn,
        authoritativeRequest.canvasBackgroundColor,
      );
      return pdfResponse(
        authoritativeRequest,
        snapshotPdf,
        `legacy-approved-${snapshot.source}-direct`,
        snapshot,
      );
    }

    // There is no permanent approved snapshot. Preserve old compatibility as a
    // final fallback, but do not silently use this path when a proof exists.
    const fallbackBuffer = await renderThroughProductionRenderer(authoritativeRequest);
    return pdfResponse(authoritativeRequest, fallbackBuffer, 'legacy-reconstruction-fallback');
  } catch (error) {
    console.error('[ADMIN_PRINT_PDF] generation failed:', error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error?.message || 'Failed to produce print PDF',
      }),
    };
  }
};

exports._test = {
  isUsableApprovedSnapshotUrl,
  getApprovedSnapshotCandidates,
  relativeAspectError,
  isBetterSnapshot,
  looksLikeJpeg,
  looksLikePng,
};
