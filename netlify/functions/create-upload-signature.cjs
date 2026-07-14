const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function sanitizeBaseName(filename) {
  const raw = String(filename || 'artwork')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return raw || 'artwork';
}

function normalizeMimeType(mimeType, extension) {
  const value = String(mimeType || '').trim().toLowerCase();
  if (value) return value;
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return json(500, {
      error: 'UPLOAD_STORAGE_NOT_CONFIGURED',
      message: 'Artwork storage is not configured for this deployment.',
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_error) {
    return json(400, { error: 'INVALID_JSON', message: 'Invalid upload request.' });
  }

  const filename = String(body.filename || '').trim();
  const extension = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
  const mimeType = normalizeMimeType(body.mimeType, extension);
  const size = Number(body.size || 0);

  if (!filename || !ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return json(415, {
      error: 'UNSUPPORTED_ARTWORK_TYPE',
      message: 'Allowed uploads are PNG, JPG/JPEG, and PDF only.',
    });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return json(size > MAX_BYTES ? 413 : 400, {
      error: size > MAX_BYTES ? 'ARTWORK_TOO_LARGE' : 'INVALID_ARTWORK_SIZE',
      message: 'Artwork must be larger than 0 bytes and no more than 50MB.',
    });
  }

  const resourceType = extension === 'pdf' ? 'raw' : 'image';
  const folder = String(process.env.CLOUDINARY_FOLDER || 'uploads').replace(/^\/+|\/+$/g, '');
  const uniqueId = crypto.randomUUID();
  const safeBaseName = sanitizeBaseName(filename);
  const publicId = resourceType === 'raw'
    ? `${uniqueId}_${safeBaseName}.${extension}`
    : `${uniqueId}_${safeBaseName}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const signedParams = {
    folder,
    public_id: publicId,
    timestamp,
  };
  const signature = cloudinary.utils.api_sign_request(
    signedParams,
    process.env.CLOUDINARY_API_SECRET,
  );

  return json(200, {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    publicId,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    maxBytes: MAX_BYTES,
  });
};
