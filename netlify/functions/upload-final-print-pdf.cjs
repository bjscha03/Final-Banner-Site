/**
 * Upload Final Print PDF for Design Service Orders
 * This function allows admins to upload the final print-ready PDF
 * for orders where the customer requested "Let Us Design It"
 */

const Busboy = require('busboy');
const { v2: cloudinary } = require('cloudinary');
const { neon } = require('@neondatabase/serverless');

const MAX_BYTES = 50 * 1024 * 1024; // 50MB max for PDFs

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const sql = neon(process.env.DATABASE_URL);

// Parse multipart form data
function parseMultipart(contentType, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const result = { file: null, fields: {} };
    const busboy = Busboy({ 
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_BYTES }
    });
    const chunks = [];

    busboy.on('file', (fieldname, file, info) => {
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        result.file = {
          filename: info.filename,
          mimeType: info.mimeType,
          data: Buffer.concat(chunks)
        };
      });
    });

    busboy.on('field', (fieldname, value) => {
      result.fields[fieldname] = value;
    });

    busboy.on('finish', () => resolve(result));
    busboy.on('error', reject);

    busboy.end(bodyBuffer);
  });
}

exports.handler = async (event) => {
  console.log('[Upload Final PDF] Request received');

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!ct.includes('multipart/form-data')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Expected multipart/form-data' }) };
    }

    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64') 
      : Buffer.from(event.body, 'binary');

    const parseResult = await parseMultipart(ct, bodyBuffer);

    if (!parseResult.file) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No file provided' }) };
    }

    const { orderId, itemIndex } = parseResult.fields;

    if (!orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing orderId' }) };
    }

    const { filename, mimeType, data } = parseResult.file;

    // Validate it's a PDF
    if (mimeType !== 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only PDF files are allowed' }) };
    }

    console.log('[Upload Final PDF] Uploading to Cloudinary:', { filename, size: data.length });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'final-print-pdfs',
          resource_type: 'raw',
          public_id: `order-${orderId}-final-${Date.now()}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(data);
    });

    console.log('[Upload Final PDF] Uploaded:', uploadResult.secure_url);

    // Update the order item in the database
    const itemIdx = parseInt(itemIndex || '0', 10);
    const now = new Date().toISOString();

    // Get the order items from order_items table
    const orderItemRows = await sql`
      SELECT id FROM order_items
      WHERE order_id = ${orderId}
      ORDER BY id ASC
    `;

    if (orderItemRows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order items not found' }) };
    }

    // Get the specific item by index
    if (itemIdx < 0 || itemIdx >= orderItemRows.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid item index' }) };
    }

    const orderItemId = orderItemRows[itemIdx].id;

    // Update the specific order_item with the final PDF info
    await sql`
      UPDATE order_items
      SET
        final_print_pdf_url = ${uploadResult.secure_url},
        final_print_pdf_file_key = ${uploadResult.public_id},
        final_print_pdf_uploaded_at = ${now}
      WHERE id = ${orderItemId}
    `;

    console.log('[Upload Final PDF] Order item updated successfully:', orderItemId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: uploadResult.secure_url,
        fileKey: uploadResult.public_id,
        uploadedAt: now,
      }),
    };
  } catch (error) {
    console.error('[Upload Final PDF] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};

