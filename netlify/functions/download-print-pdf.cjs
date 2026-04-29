/**
 * Admin Print PDF Download Endpoint
 *
 * Acts as a server-side proxy for admin print-ready PDF downloads.
 *
 * Why this exists:
 * The cached `generated_print_pdf_url` is hosted on Cloudinary as a raw asset.
 * When the Cloudinary account / delivery settings restrict raw delivery, the
 * browser receives a 401 on a direct fetch ("Failed to fetch cached PDF: 401").
 * This endpoint never exposes the raw Cloudinary URL to the browser. Instead it:
 *   1. Looks up the cached PDF URL from `order_items.generated_print_pdf_url`.
 *   2. Tries to download it server-side (direct, then signed via Cloudinary SDK).
 *   3. If the cached PDF cannot be fetched (401/403/404), it regenerates the PDF
 *      by invoking the existing `render-order-pdf` function.
 *   4. Streams the resulting bytes back to the admin client as
 *      `Content-Type: application/pdf` with an `attachment` disposition.
 *
 * Request: POST JSON. The body is forwarded verbatim to `render-order-pdf` if
 * regeneration is required, so the frontend can pass the same payload it would
 * normally build for that function (orderId, itemId, canvasStateJson, …).
 *
 * Required fields: { orderId }
 * Recommended:     { itemId } so we can look up the cached URL from the DB.
 */

const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

const SIGNED_URL_EXPIRY_SECONDS = 600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Parse a Cloudinary delivery URL into its component parts so we can ask the
 * SDK to sign a download URL for it.
 *
 * Example URL:
 *   https://res.cloudinary.com/<cloud>/raw/upload/v1700000000/order-pdfs/order-123-print-ready-1700000000.pdf
 */
function parseCloudinaryUrl(url) {
  try {
    const parsed = new URL(url);
    // Accept only hostnames that are exactly cloudinary.com or a subdomain of it
    // (e.g. res.cloudinary.com). Using endsWith on a leading-dot pattern avoids
    // the "incomplete URL substring sanitization" pitfall (e.g. evil.com/cloudinary.com/...).
    const host = parsed.hostname.toLowerCase();
    const isCloudinaryHost = host === 'cloudinary.com' || host.endsWith('.cloudinary.com');
    if (!isCloudinaryHost) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    // segments: [<cloud_name>, <resource_type>, <delivery_type>, ...rest]
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
      // For raw resources Cloudinary keeps the extension as part of the public_id,
      // but `private_download_url` expects the base id + format separately.
      publicId = publicIdWithExt.slice(0, dotIdx);
    }
    return { cloudName, resourceType, deliveryType, publicId, format };
  } catch {
    return null;
  }
}

/**
 * Server-side fetch helper that returns the response body as a Buffer when OK.
 */
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

/**
 * Try every reasonable strategy to download a Cloudinary-hosted PDF given its
 * stored secure URL. Returns { ok, buffer, method, status }.
 */
async function downloadCloudinaryPdf(cachedUrl, log) {
  // 1) Public direct fetch (works when the asset is public/upload).
  const direct = await fetchAsBuffer(cachedUrl);
  log('cached fetch status (public direct):', direct.status);
  if (direct.ok) {
    return { ok: true, buffer: direct.buffer, method: 'public-direct', status: direct.status };
  }

  // 2) Generate a signed download URL via Cloudinary SDK and fetch that. This
  //    bypasses delivery restrictions because it carries an api_key + signature.
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
        }
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
  // Prefer in-process invocation to avoid an extra HTTP round-trip and to
  // sidestep any Netlify routing that may not be configured locally.
  try {
    const renderModule = require('./render-order-pdf.cjs');
    if (renderModule && typeof renderModule.handler === 'function') {
      log('regenerating PDF via in-process render-order-pdf handler');
      const fakeEvent = {
        httpMethod: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody || {}),
        isBase64Encoded: false,
      };
      const res = await renderModule.handler(fakeEvent, {});
      if (!res || res.statusCode >= 400) {
        const body = res && res.body ? String(res.body).slice(0, 500) : 'no body';
        throw new Error(`render-order-pdf returned ${res && res.statusCode}: ${body}`);
      }
      const json = JSON.parse(res.body || '{}');
      if (json.error) throw new Error(typeof json.error === 'string' ? json.error : 'Regeneration failed');
      if (json.pdfBase64) {
        return { buffer: Buffer.from(json.pdfBase64, 'base64'), pdfUrl: json.pdfUrl || null };
      }
      // No inline base64? Try to fetch the URL it returned.
      if (json.pdfUrl) {
        const fetched = await downloadCloudinaryPdf(json.pdfUrl, log);
        if (fetched.ok) return { buffer: fetched.buffer, pdfUrl: json.pdfUrl };
      }
      throw new Error('Regenerated PDF response had no usable data');
    }
  } catch (err) {
    log('in-process regeneration failed, falling back to HTTP:', err && err.message);
  }

  // HTTP fallback (e.g. local dev where require resolution may differ).
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || process.env.DEPLOY_PRIME_URL || '';
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Regeneration failed and no usable base URL configured for HTTP fallback');
  }
  const fnUrl = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/render-order-pdf`;
  log('regenerating PDF via HTTP:', fnUrl);
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody || {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`render-order-pdf HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(typeof json.error === 'string' ? json.error : 'Regeneration failed');
  if (json.pdfBase64) {
    return { buffer: Buffer.from(json.pdfBase64, 'base64'), pdfUrl: json.pdfUrl || null };
  }
  if (json.pdfUrl) {
    const fetched = await downloadCloudinaryPdf(json.pdfUrl, log);
    if (fetched.ok) return { buffer: fetched.buffer, pdfUrl: json.pdfUrl };
  }
  throw new Error('Regenerated PDF response had no usable data');
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
  log('request received', { itemId: itemId || null, itemIndex: typeof itemIndex === 'number' ? itemIndex : null });

  // 1) Resolve the cached PDF URL — DB is authoritative when an itemId is given.
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
      log('✅ delivered cached PDF via', method);
    } else {
      log(`Cached PDF unauthorized; regenerating PDF (status=${result.status})`);
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
        body: JSON.stringify({ error: (err && err.message) || 'Failed to produce print PDF' }),
      };
    }
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Print PDF was empty' }),
    };
  }

  const safeOrderId = String(orderId).replace(/[^A-Za-z0-9_-]/g, '');
  const filename = `order-${safeOrderId.slice(-8) || safeOrderId}-print.pdf`;
  log('final delivery method:', method, 'bytes:', pdfBuffer.length, 'filename:', filename);

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Print-PDF-Source': method,
    },
    body: pdfBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};
