/**
 * Admin Print PDF Download Endpoint
 *
 * Acts as a server-side proxy for admin print-ready PDF downloads.
 *
 * PDF artwork with saved designer state is handled first and is composed from
 * the original uploaded PDF page as a PDF Form XObject. That preserves vector
 * text/lines at every zoom level and deliberately bypasses any previously
 * cached rasterized print PDF.
 */

const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');
const {
  isPdfDesignState,
  renderVectorDesignStatePdf,
} = require('./_shared/vector-design-state-pdf.cjs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
const sql = databaseUrl ? neon(databaseUrl) : null;

const SIGNED_URL_EXPIRY_SECONDS = 600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function parseCanvasState(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function makePdfResponse(pdfBuffer, orderId, method, extraHeaders = {}) {
  const safeOrderId = String(orderId).replace(/[^A-Za-z0-9_-]/g, '');
  const filename = `order-${safeOrderId.slice(-8) || safeOrderId}-print.pdf`;
  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Print-PDF-Source': method,
      ...extraHeaders,
    },
    body: pdfBuffer.toString('base64'),
    isBase64Encoded: true,
  };
}

/**
 * Parse a Cloudinary delivery URL into its component parts so we can ask the
 * SDK to sign a download URL for it.
 */
function parseCloudinaryUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isCloudinaryHost = host === 'cloudinary.com' || host.endsWith('.cloudinary.com');
    if (!isCloudinaryHost) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4) return null;
    const cloudName = segments[0];
    const resourceType = segments[1] || 'raw';
    const deliveryType = segments[2] || 'upload';
    const rest = segments.slice(3).filter((seg) => !/^v\d+$/.test(seg));
    const publicIdWithExt = rest.join('/');
    if (!publicIdWithExt) return null;

    let format = null;
    let publicId = publicIdWithExt;
    const dotIdx = publicIdWithExt.lastIndexOf('.');
    if (dotIdx > -1) {
      format = publicIdWithExt.slice(dotIdx + 1).toLowerCase();
      publicId = publicIdWithExt.slice(0, dotIdx);
    }
    return { cloudName, resourceType, deliveryType, publicId, format };
  } catch {
    return null;
  }
}

async function fetchAsBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, buffer: buf };
  } catch (err) {
    return { ok: false, status: 0, error: err && err.message };
  }
}

async function downloadCloudinaryPdf(cachedUrl, log) {
  const direct = await fetchAsBuffer(cachedUrl);
  log('cached fetch status (public direct):', direct.status);
  if (direct.ok) {
    return { ok: true, buffer: direct.buffer, method: 'public-direct', status: direct.status };
  }

  const parsed = parseCloudinaryUrl(cachedUrl);
  if (parsed && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    try {
      const signedUrl = cloudinary.utils.private_download_url(
        parsed.publicId,
        parsed.format || 'pdf',
        {
          resource_type: parsed.resourceType || 'raw',
          type: parsed.deliveryType || 'upload',
          attachment: true,
          expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRY_SECONDS,
        },
      );
      log('signed download URL generated for', parsed.resourceType + '/' + parsed.deliveryType);
      const signed = await fetchAsBuffer(signedUrl);
      log('cached fetch status (signed):', signed.status);
      if (signed.ok) {
        return { ok: true, buffer: signed.buffer, method: 'signed', status: signed.status };
      }
      return { ok: false, status: signed.status };
    } catch (err) {
      log('signed URL generation failed:', err && err.message);
    }
  } else if (!parsed) {
    log('cached URL is not a parseable Cloudinary URL; skipping signed fallback');
  }

  return { ok: false, status: direct.status };
}

/**
 * Invoke the existing render-order-pdf function in-process, falling back to an
 * HTTP self-call if the module export is unavailable. Returns a Buffer.
 */
async function regeneratePdf(requestBody, log) {
  const regenBody = {
    ...(requestBody || {}),
    forceRegenerate: true,
    cachedPdfUrl: null,
    generatedPrintPdfUrl: null,
  };

  try {
    const renderModule = require('./render-order-pdf.cjs');
    if (renderModule && typeof renderModule.handler === 'function') {
      log('regenerating PDF via in-process render-order-pdf handler (forceRegenerate=true)');
      const fakeEvent = {
        httpMethod: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(regenBody),
        isBase64Encoded: false,
      };
      const res = await renderModule.handler(fakeEvent, {});
      if (!res || res.statusCode >= 400) {
        const body = res && res.body ? String(res.body).slice(0, 500) : 'no body';
        throw new Error(`render-order-pdf returned ${res && res.statusCode}: ${body}`);
      }
      const json = JSON.parse(res.body || '{}');
      if (json.error) throw new Error(typeof json.error === 'string' ? json.error : 'Regeneration failed');
      log('regen response keys=', Object.keys(json).join(','),
        'pdfBase64.len=', json.pdfBase64 ? json.pdfBase64.length : 0,
        'pdfUrl=', json.pdfUrl ? 'present' : 'none');
      if (json.pdfBase64) {
        const buf = Buffer.from(json.pdfBase64, 'base64');
        if (!buf || buf.length === 0) {
          throw new Error('PDF generation completed but returned an empty buffer');
        }
        return { buffer: buf, pdfUrl: json.pdfUrl || null };
      }
      if (json.pdfUrl) {
        const fetched = await downloadCloudinaryPdf(json.pdfUrl, log);
        if (fetched.ok && fetched.buffer && fetched.buffer.length > 0) {
          return { buffer: fetched.buffer, pdfUrl: json.pdfUrl };
        }
      }
      throw new Error('PDF generation completed but returned no buffer or downloadUrl');
    }
  } catch (err) {
    log('in-process regeneration failed, falling back to HTTP:', err && err.message);
  }

  const baseUrl = process.env.URL || process.env.DEPLOY_URL || process.env.DEPLOY_PRIME_URL || '';
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Regeneration failed and no usable base URL configured for HTTP fallback');
  }
  const fnUrl = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/render-order-pdf`;
  log('regenerating PDF via HTTP:', fnUrl);
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regenBody),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`render-order-pdf HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(typeof json.error === 'string' ? json.error : 'Regeneration failed');
  log('regen HTTP response keys=', Object.keys(json).join(','),
    'pdfBase64.len=', json.pdfBase64 ? json.pdfBase64.length : 0,
    'pdfUrl=', json.pdfUrl ? 'present' : 'none');
  if (json.pdfBase64) {
    const buf = Buffer.from(json.pdfBase64, 'base64');
    if (!buf || buf.length === 0) {
      throw new Error('PDF generation completed but returned an empty buffer');
    }
    return { buffer: buf, pdfUrl: json.pdfUrl || null };
  }
  if (json.pdfUrl) {
    const fetched = await downloadCloudinaryPdf(json.pdfUrl, log);
    if (fetched.ok && fetched.buffer && fetched.buffer.length > 0) {
      return { buffer: fetched.buffer, pdfUrl: json.pdfUrl };
    }
  }
  throw new Error('PDF generation completed but returned no buffer or downloadUrl');
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

  const { orderId, itemId, itemIndex } = req || {};
  if (!orderId) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'orderId is required' }),
    };
  }

  const log = (...args) => console.log('[ADMIN_PRINT_PDF]', `order=${orderId}`, ...args);
  const designState = parseCanvasState(req.canvasStateJson);
  log('request received', {
    itemId: itemId || null,
    itemIndex: typeof itemIndex === 'number' ? itemIndex : null,
    bannerSize: req.bannerWidthIn && req.bannerHeightIn
      ? `${req.bannerWidthIn}x${req.bannerHeightIn}in`
      : 'unknown',
    hasCanvasStateJson: !!req.canvasStateJson,
    isOriginalPdfDesign: isPdfDesignState(designState),
    hasFinalRender: !!(req.finalRenderUrl || req.finalRenderFileKey),
  });

  // Highest priority: preserve an uploaded PDF as vector. Do not reuse an old
  // raster cache, thumbnail, canvas screenshot, or Cloudinary page PNG.
  if (isPdfDesignState(designState)) {
    try {
      log('composing vector print PDF from original uploaded PDF page');
      const vectorResult = await renderVectorDesignStatePdf({
        designState,
        bannerWidthIn: req.bannerWidthIn,
        bannerHeightIn: req.bannerHeightIn,
        bleedIn: req.includeBleed === false ? 0 : Number(req.bleedIn || 0),
      });
      log('✅ vector PDF composed from original artwork', vectorResult.metadata);
      return makePdfResponse(vectorResult.buffer, orderId, 'vector-original-pdf', {
        'X-Original-Artwork-Vector': 'true',
        'X-Vector-Renderer': vectorResult.metadata.renderer,
      });
    } catch (err) {
      console.error('[ADMIN_PRINT_PDF] vector PDF composition failed:', err && err.stack);
      return {
        statusCode: 422,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          success: false,
          error: 'Could not compose the print PDF from the original uploaded PDF.',
          details: err && err.message,
        }),
      };
    }
  }

  // Raster artwork and legacy orders may reuse a valid cached PDF.
  let cachedUrl = req.cachedPdfUrl || req.generatedPrintPdfUrl || null;
  if (sql && itemId) {
    try {
      const rows = await sql`
        SELECT generated_print_pdf_url
        FROM order_items
        WHERE id = ${itemId}
        LIMIT 1
      `;
      const dbUrl = rows && rows[0] && rows[0].generated_print_pdf_url;
      if (dbUrl) cachedUrl = dbUrl;
    } catch (err) {
      log('DB lookup failed (non-fatal):', err && err.message);
    }
  }

  const cachedParsed = cachedUrl ? parseCloudinaryUrl(cachedUrl) : null;
  log('cached PDF url:', cachedUrl ? 'present' : 'NONE',
    cachedParsed ? `(${cachedParsed.resourceType}/${cachedParsed.deliveryType})` : '');

  let pdfBuffer = null;
  let method = 'regenerated';

  if (cachedUrl) {
    const result = await downloadCloudinaryPdf(cachedUrl, log);
    if (result.ok) {
      pdfBuffer = result.buffer;
      method = result.method;
      log('✅ delivered cached PDF via', method, 'bytes=', pdfBuffer.length);
    } else {
      log(`Cached PDF unauthorized; regenerating PDF (status=${result.status})`);
      if (sql && itemId) {
        try {
          await sql`
            UPDATE order_items
            SET generated_print_pdf_url = NULL,
                generated_print_pdf_uploaded_at = NULL
            WHERE id = ${itemId}
          `;
          log('cleared stale generated_print_pdf_url for item', itemId);
        } catch (clearErr) {
          log('failed to clear stale URL (non-fatal):', clearErr && clearErr.message);
        }
      }
    }
  } else {
    log('no cached PDF URL — regenerating');
  }

  if (!pdfBuffer) {
    try {
      const regen = await regeneratePdf(req, log);
      pdfBuffer = regen.buffer;
      method = 'regenerated';
      log('✅ regenerated PDF, fresh url:', regen.pdfUrl || '(inline only)', 'bytes=', pdfBuffer.length);
    } catch (err) {
      console.error('[ADMIN_PRINT_PDF] regeneration failed:', err && err.stack);
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: (err && err.message) || 'Failed to produce print PDF' }),
      };
    }
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    log('❌ pdfBuffer missing or empty after generation');
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Print PDF was empty' }),
    };
  }

  log('final delivery: contentType=application/pdf method=' + method + ' bytes=' + pdfBuffer.length);
  return makePdfResponse(pdfBuffer, orderId, method);
};
