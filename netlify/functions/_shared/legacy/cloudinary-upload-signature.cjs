'use strict';

const { v2: cloudinary } = require('cloudinary');

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json',
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

const extensionOf = (fileName) => {
  const match = String(fileName || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

const isAllowedArtwork = ({ fileName, mimeType }) => {
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  const extension = extensionOf(fileName);
  return ALLOWED_MIME_TYPES.has(normalizedMime) || ALLOWED_EXTENSIONS.has(extension);
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Method not allowed' });
  }

  try {
    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[cloudinary-upload-signature] credentials missing', {
        cloudNamePresent: Boolean(cloudName),
        apiKeyPresent: Boolean(apiKey),
        apiSecretPresent: Boolean(apiSecret),
      });
      return reply(500, { error: 'Artwork storage is temporarily unavailable.' });
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'Invalid request body.' });
    }

    const fileName = String(payload.fileName || '').trim();
    const mimeType = String(payload.mimeType || '').trim().toLowerCase();
    const size = Number(payload.size || 0);
    if (!fileName || !Number.isFinite(size) || size <= 0) {
      return reply(400, { error: 'File metadata is required.' });
    }
    if (size > MAX_BYTES) {
      return reply(413, { error: 'File too large. Maximum artwork size is 50MB.' });
    }
    if (!isAllowedArtwork({ fileName, mimeType })) {
      return reply(415, { error: 'Please upload a PDF, PNG, JPG, or JPEG file.' });
    }

    const folder = String(process.env.CLOUDINARY_FOLDER || 'uploads').trim() || 'uploads';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParameters = {
      folder,
      overwrite: false,
      timestamp,
      unique_filename: true,
      use_filename: true,
    };
    const signature = cloudinary.utils.api_sign_request(signedParameters, apiSecret);

    return reply(200, {
      apiKey,
      cloudName,
      expiresAt: (timestamp + 3600) * 1000,
      folder,
      overwrite: false,
      resourceType: 'image',
      signature,
      timestamp,
      uniqueFilename: true,
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      useFilename: true,
    });
  } catch (error) {
    console.error('[cloudinary-upload-signature] unexpected error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return reply(500, { error: 'Could not prepare artwork upload.' });
  }
};

exports._test = {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_BYTES,
  extensionOf,
  isAllowedArtwork,
};
