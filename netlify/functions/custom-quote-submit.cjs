const Busboy = require('busboy');
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { v2: cloudinary } = require('cloudinary');

const PRODUCT_LABELS = { banner: 'Banner', yard_sign: 'Yard Sign', magnet: 'Magnet' };
const VALID_PRODUCTS = Object.keys(PRODUCT_LABELS);
const VALID_UNITS = ['inches', 'feet', 'cm'];
const MAX_FILES = 8;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'ai', 'eps', 'svg'];
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/svg+xml',
  'application/postscript',
  'application/illustrator',
  'application/vnd.adobe.illustrator',
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function isDiagnosticEnvironment() {
  return process.env.CONTEXT === 'deploy-preview' || process.env.CONTEXT === 'branch-deploy' || process.env.NODE_ENV !== 'production';
}

function response(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(statusCode, error, stage) {
  return response(statusCode, {
    success: false,
    ok: false,
    error: isDiagnosticEnvironment() ? error : 'Failed to submit custom quote request',
    stage: isDiagnosticEnvironment() ? stage : undefined,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFileName(name) {
  return String(name || 'artwork').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
}

function getDatabaseUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
}

function getMissingStorageVars(files) {
  if (!files.length) return [];
  return ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter((name) => !process.env[name]);
}

function validateFile(file) {
  const ext = file.filename.split('.').pop()?.toLowerCase() || '';
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type for ${file.filename}. Accepted files: ${ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')}`);
  }
  if (file.mimeType && !ACCEPTED_MIME_TYPES.includes(file.mimeType.toLowerCase()) && ext !== 'ai' && ext !== 'eps') {
    throw new Error(`Unsupported media type for ${file.filename}`);
  }
  if (file.data.length > MAX_FILE_BYTES) {
    throw new Error(`${file.filename} exceeds the 200MB file-size limit`);
  }
}

function parseMultipart(contentType, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];
    const busboy = Busboy({ headers: { 'content-type': contentType }, limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES } });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldname, stream, info) => {
      const chunks = [];
      const filename = info.filename || 'artwork';
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => reject(new Error(`${filename} exceeds the 200MB file-size limit`)));
      stream.on('end', () => {
        if (fieldname === 'files' || fieldname === 'file' || fieldname === 'artwork') {
          files.push({ fieldname, filename, mimeType: info.mimeType || '', data: Buffer.concat(chunks) });
        }
      });
    });

    busboy.on('filesLimit', () => reject(new Error(`Too many files. Maximum ${MAX_FILES} files are allowed.`)));
    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ fields, files }));
    busboy.end(bodyBuffer);
  });
}

async function parseRequest(event) {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  console.log('[custom-quote] content type', contentType);

  if (contentType.includes('multipart/form-data')) {
    const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'binary');
    const parsed = await parseMultipart(contentType, bodyBuffer);
    return { data: parsed.fields, files: parsed.files };
  }

  if (contentType.includes('application/json')) {
    const data = JSON.parse(event.body || '{}');
    return { data, files: [] };
  }

  throw new Error('Unsupported content type. Use multipart/form-data.');
}

function parseProductOptions(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid productOptions JSON');
  }
}

function normalizeSubmission(data) {
  const productOptions = parseProductOptions(data.productOptions);
  const normalized = {
    fullName: String(data.fullName || '').trim(),
    companyName: String(data.companyName || '').trim() || null,
    email: String(data.email || '').trim(),
    phone: String(data.phone || '').trim(),
    productType: String(data.productType || '').trim(),
    width: Number(data.width),
    height: Number(data.height),
    unit: String(data.unit || '').trim(),
    quantity: Number.parseInt(String(data.quantity || ''), 10),
    materialSpecs: String(data.materialSpecs || '').trim() || null,
    finishingOptions: String(data.finishingOptions || '').trim() || null,
    neededByDate: String(data.neededByDate || '').trim() || null,
    shippingZip: String(data.shippingZip || '').trim(),
    projectDescription: String(data.projectDescription || '').trim(),
    additionalNotes: String(data.additionalNotes || '').trim() || null,
    productOptions,
  };

  const required = ['fullName', 'email', 'phone', 'productType', 'unit', 'shippingZip', 'projectDescription'];
  for (const field of required) {
    if (!normalized[field]) throw new Error(`${field} is required`);
  }
  if (!/^\S+@\S+\.\S+$/.test(normalized.email)) throw new Error('Please provide a valid email address');
  if (!VALID_PRODUCTS.includes(normalized.productType)) throw new Error('Invalid product type');
  if (!VALID_UNITS.includes(normalized.unit)) throw new Error('Invalid unit of measurement');
  if (!Number.isFinite(normalized.width) || normalized.width <= 0) throw new Error('Width must be a positive number');
  if (!Number.isFinite(normalized.height) || normalized.height <= 0) throw new Error('Height must be a positive number');
  if (!Number.isInteger(normalized.quantity) || normalized.quantity <= 0) throw new Error('Quantity must be a positive whole number');
  if (normalized.neededByDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.neededByDate)) throw new Error('Needed-by date must be YYYY-MM-DD');

  return normalized;
}

async function uploadFiles(files) {
  if (!files.length) return [];
  const missing = getMissingStorageVars(files);
  if (missing.length) throw new Error(`Missing required environment variable: ${missing[0]}`);

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  const folder = process.env.CLOUDINARY_FOLDER || 'quote-requests';
  const uploaded = [];
  for (const file of files) {
    validateFile(file);
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          filename_override: sanitizeFileName(file.filename),
          use_filename: true,
          unique_filename: true,
          timeout: 60000,
        },
        (err, res) => {
          if (err) reject(err);
          else if (!res) reject(new Error('No upload result returned'));
          else resolve(res);
        },
      );
      stream.end(file.data);
    });
    uploaded.push({
      originalName: file.filename,
      mimeType: file.mimeType,
      size: file.data.length,
      secureUrl: result.secure_url,
      publicId: result.public_id,
      fileKey: result.public_id,
    });
  }
  return uploaded;
}

async function ensureDatabaseObjects(sql) {
  await sql`CREATE SEQUENCE IF NOT EXISTS custom_quote_request_number_seq START WITH 1`;
  await sql`
    CREATE TABLE IF NOT EXISTS custom_quote_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_number VARCHAR(20) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'New',
      full_name VARCHAR(160) NOT NULL,
      company_name VARCHAR(160),
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      product_type VARCHAR(40) NOT NULL,
      width NUMERIC(10,2) NOT NULL,
      height NUMERIC(10,2) NOT NULL,
      unit VARCHAR(20) NOT NULL,
      quantity INTEGER NOT NULL,
      material_specs TEXT,
      finishing_options TEXT,
      needed_by_date DATE,
      shipping_zip VARCHAR(20) NOT NULL,
      project_description TEXT NOT NULL,
      additional_notes TEXT,
      product_options JSONB NOT NULL DEFAULT '{}'::jsonb,
      artwork_files JSONB NOT NULL DEFAULT '[]'::jsonb,
      email_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      internal_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`ALTER TABLE custom_quote_requests ADD COLUMN IF NOT EXISTS email_warnings JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`CREATE INDEX IF NOT EXISTS idx_custom_quote_requests_status ON custom_quote_requests(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_custom_quote_requests_created_at ON custom_quote_requests(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_custom_quote_requests_email ON custom_quote_requests(email)`;
}

function optionRows(options = {}) {
  return Object.entries(options)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${escapeHtml(key.replace(/_/g, ' '))}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</td></tr>`)
    .join('');
}

async function sendEmails(submission, quoteNumber, createdAt, files) {
  const warnings = [];
  if (!process.env.RESEND_API_KEY) {
    console.warn('[custom-quote] RESEND_API_KEY missing; emails skipped');
    return ['RESEND_API_KEY missing; emails were not sent'];
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
  const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';
  const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
  const product = PRODUCT_LABELS[submission.productType];
  const submitted = new Date(createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  const summary = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Product</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(product)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Size</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(`${submission.width} × ${submission.height} ${submission.unit}`)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Quantity</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${submission.quantity}</td></tr>${optionRows(submission.productOptions)}</table>`;
  const base = (title, body) => `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;"><div style="max-width:680px;margin:0 auto;padding:24px;"><div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;"><div style="text-align:center;padding:22px;"><img src="${logoUrl}" alt="Banners On The Fly" style="height:54px;"></div><div style="background:#18448D;color:white;padding:24px;text-align:center;"><h1 style="margin:0;font-size:24px;">${title}</h1><p style="margin:8px 0 0;color:#dbeafe;">${quoteNumber}</p></div><div style="padding:26px;">${body}</div></div></div></body></html>`;

  try {
    await resend.emails.send({
      from: `Banners on the Fly <${emailFrom}>`,
      to: adminEmail,
      subject: `🎉 New Custom Quote Request – ${quoteNumber} – ${submission.fullName}`,
      reply_to: submission.email,
      html: base('New Custom Quote Request', `<h2 style="margin-top:0;">Customer</h2><p><strong>Name:</strong> ${escapeHtml(submission.fullName)}<br><strong>Company:</strong> ${escapeHtml(submission.companyName || '—')}<br><strong>Email:</strong> <a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a><br><strong>Phone:</strong> ${escapeHtml(submission.phone)}<br><strong>Submitted:</strong> ${escapeHtml(submitted)}</p>${summary}<p><strong>Needed by:</strong> ${escapeHtml(submission.neededByDate || '—')}<br><strong>Shipping ZIP:</strong> ${escapeHtml(submission.shippingZip)}</p><h3>Material / specs</h3><p style="white-space:pre-wrap;">${escapeHtml(submission.materialSpecs || '—')}</p><h3>Finishing / options</h3><p style="white-space:pre-wrap;">${escapeHtml(submission.finishingOptions || '—')}</p><h3>Project description</h3><p style="white-space:pre-wrap;">${escapeHtml(submission.projectDescription)}</p><h3>Additional notes</h3><p style="white-space:pre-wrap;">${escapeHtml(submission.additionalNotes || '—')}</p><h3>Artwork</h3><ul>${files.length ? files.map((f) => `<li><a href="${escapeHtml(f.secureUrl)}">${escapeHtml(f.originalName)}</a></li>`).join('') : '<li>No artwork uploaded</li>'}</ul>`),
    });
    console.log('[custom-quote] admin email sent');
  } catch (error) {
    console.error('[custom-quote] admin email failed', { message: safeErrorMessage(error) });
    warnings.push('Admin notification email failed');
  }

  try {
    await resend.emails.send({
      from: `Banners on the Fly <${emailFrom}>`,
      to: submission.email,
      subject: `We received your custom quote request – ${quoteNumber}`,
      reply_to: replyTo,
      html: base('Custom Quote Request Received', `<p style="font-weight:700;">Hi ${escapeHtml(submission.fullName)},</p><p>We received your custom quote request. Our team will review the details and respond with pricing.</p>${summary}<p><strong>Project summary:</strong></p><p style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">${escapeHtml(submission.projectDescription)}</p>`),
    });
    console.log('[custom-quote] customer email sent');
  } catch (error) {
    console.error('[custom-quote] customer email failed', { message: safeErrorMessage(error) });
    warnings.push('Customer confirmation email failed');
  }

  return warnings;
}

exports.handler = async (event) => {
  let stage = 'request_received';
  console.log('[custom-quote] request received');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed', stage);

  try {
    stage = 'environment_validation';
    const dbUrl = getDatabaseUrl();
    if (!dbUrl) throw new Error('Missing required environment variable: DATABASE_URL');

    stage = 'payload_parse';
    const { data, files } = await parseRequest(event);
    console.log('[custom-quote] payload parsed');
    console.log('[custom-quote] files found', files.length);

    stage = 'validation';
    const submission = normalizeSubmission(data);
    files.forEach(validateFile);

    stage = 'file_upload';
    const uploadedFiles = await uploadFiles(files);
    console.log('[custom-quote] files uploaded');

    stage = 'database_insert';
    const sql = neon(dbUrl);
    await ensureDatabaseObjects(sql);
    const seq = await sql`SELECT nextval('custom_quote_request_number_seq') AS n`;
    const quoteNumber = `QUOTE-${String(seq[0].n).padStart(6, '0')}`;
    const inserted = await sql`
      INSERT INTO custom_quote_requests (
        quote_number, full_name, company_name, email, phone, product_type, width, height, unit, quantity,
        material_specs, finishing_options, needed_by_date, shipping_zip, project_description, additional_notes,
        product_options, artwork_files
      ) VALUES (
        ${quoteNumber}, ${submission.fullName}, ${submission.companyName}, ${submission.email}, ${submission.phone},
        ${submission.productType}, ${submission.width}, ${submission.height}, ${submission.unit}, ${submission.quantity},
        ${submission.materialSpecs}, ${submission.finishingOptions}, ${submission.neededByDate}, ${submission.shippingZip},
        ${submission.projectDescription}, ${submission.additionalNotes}, ${JSON.stringify(submission.productOptions)}, ${JSON.stringify(uploadedFiles)}
      ) RETURNING id, created_at`;
    console.log('[custom-quote] database insert complete');

    stage = 'email_send';
    const emailWarnings = await sendEmails(submission, quoteNumber, inserted[0].created_at, uploadedFiles);
    if (emailWarnings.length) {
      await sql`UPDATE custom_quote_requests SET email_warnings = ${JSON.stringify(emailWarnings)}, updated_at = NOW() WHERE id = ${inserted[0].id}`;
    }

    return response(200, {
      success: true,
      ok: true,
      quoteNumber,
      id: inserted[0].id,
      emailWarnings,
    });
  } catch (error) {
    console.error('[custom-quote] submission failed', {
      message: safeErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      stage,
    });
    const statusCode = stage === 'validation' || stage === 'payload_parse' || stage === 'file_upload' ? 400 : 500;
    return fail(statusCode, safeErrorMessage(error), stage);
  }
};
