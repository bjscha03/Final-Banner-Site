// Runtime dependencies used by both the legacy banner renderer and the
// high-resolution yard-sign renderer below.
import '@neondatabase/serverless';
import 'cloudinary';
import 'sharp';
import 'pdfkit';
import 'pdf-lib';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/download-print-pdf.cjs';
import serverAuthModule from './_shared/server-auth.cjs';
import yardSignPrintModule from './_shared/yard-sign-print-pdf.cjs';

const require = createRequire(import.meta.url);
const { v2: cloudinary } = require('cloudinary');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const safeSegment = (value) => String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);

const uploadPdf = (buffer, orderId, itemId) => new Promise((resolve, reject) => {
  const publicId = `production-pdfs/order-${safeSegment(orderId)}-item-${safeSegment(itemId)}-yard-sign-print.pdf`;
  const stream = cloudinary.uploader.upload_stream(
    {
      resource_type: 'raw',
      type: 'upload',
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      use_filename: false,
    },
    (error, result) => {
      if (error) reject(error);
      else if (!result?.secure_url) reject(new Error('Cloudinary did not return a production PDF URL'));
      else resolve(result);
    },
  );
  stream.end(buffer);
});

const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }

  // Leave all non-POST behavior and all banner/car-magnet rendering on the
  // proven legacy endpoint.
  if (event.httpMethod !== 'POST') return legacyModule.handler(event, context);

  const auth = serverAuthModule.requireAdmin(event);
  if (!auth.ok) return auth.response;

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return legacyModule.handler(event, context);
  }

  const itemId = request.itemId ? String(request.itemId) : null;
  const orderId = request.orderId ? String(request.orderId) : null;
  if (!itemId || !orderId) return legacyModule.handler(event, context);

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return legacyModule.handler(event, context);

  const sql = neon(dbUrl);
  let item;
  try {
    const rows = await sql(
      `SELECT id::text AS id,
              order_id::text AS order_id,
              product_type,
              width_in,
              height_in,
              yard_sign_designs
         FROM order_items
        WHERE id::text = $1
          AND order_id::text = $2
        LIMIT 1`,
      [itemId, orderId],
    );
    item = rows?.[0] || null;
  } catch (error) {
    console.error('[yard-sign-print] item lookup failed; using legacy renderer', {
      orderId,
      itemId,
      error: error instanceof Error ? error.message : String(error),
    });
    return legacyModule.handler(event, context);
  }

  if (String(item?.product_type || '') !== 'yard_sign' || !item?.yard_sign_designs) {
    return legacyModule.handler(event, context);
  }

  try {
    const rendered = await yardSignPrintModule.renderYardSignPrintPdf({
      designs: item.yard_sign_designs,
      widthIn: Number(item.width_in) || 24,
      heightIn: Number(item.height_in) || 18,
      dpi: 150,
      orderId,
    });

    const upload = await uploadPdf(rendered.buffer, orderId, itemId);
    const metadata = {
      source: 'yard-sign-original-artwork-render',
      pageCount: rendered.pageCount,
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
      dpi: rendered.dpi,
      generatedAt: new Date().toISOString(),
    };

    await sql(
      `UPDATE order_items
          SET generated_print_pdf_url = $1,
              generated_print_pdf_uploaded_at = NOW(),
              generated_print_pdf_metadata = $2::jsonb,
              production_pdf_status = 'ready',
              production_pdf_error = NULL
        WHERE id::text = $3
          AND order_id::text = $4`,
      [upload.secure_url, JSON.stringify(metadata), itemId, orderId],
    );

    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        success: true,
        pdfUrl: upload.secure_url,
        downloadUrl: upload.secure_url,
        source: metadata.source,
        pageCount: rendered.pageCount,
        dpi: rendered.dpi,
        widthPx: rendered.widthPx,
        heightPx: rendered.heightPx,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[yard-sign-print] high-resolution rendering failed', {
      orderId,
      itemId,
      error: message,
    });
    try {
      await sql(
        `UPDATE order_items
            SET production_pdf_status = 'failed',
                production_pdf_error = $1
          WHERE id::text = $2
            AND order_id::text = $3`,
        [message.slice(0, 1000), itemId, orderId],
      );
    } catch (statusError) {
      console.error('[yard-sign-print] failed to persist renderer error', statusError);
    }

    // Do not silently hand production a known low-resolution thumbnail PDF.
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        success: false,
        error: `High-resolution yard sign PDF could not be generated: ${message}`,
      }),
    };
  }
};

export default withLambda(handler);
