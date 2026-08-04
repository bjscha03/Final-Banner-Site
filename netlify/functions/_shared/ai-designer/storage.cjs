'use strict';

const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');

const TEMP_TTL_SECONDS = 24 * 60 * 60;

function isTemporaryStorageConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET
    && (process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET),
  );
}

function configure() {
  if (!isTemporaryStorageConfigured()) {
    const error = new Error('Temporary AI artwork storage is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function storageSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET || '';
}

function subjectHash(session) {
  return crypto.createHash('sha256').update(String(session?.sub || '')).digest('hex');
}

function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', storageSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readPayload(reference, session) {
  const [encoded, signature] = String(reference || '').split('.');
  if (!encoded || !signature || !storageSecret()) return null;
  const expected = crypto.createHmac('sha256', storageSecret()).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.sub !== subjectHash(session) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!/^[-/a-zA-Z0-9_]+$/.test(payload.publicId || '')) return null;
    return payload;
  } catch {
    return null;
  }
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) reject(error || new Error('Temporary upload returned no result.'));
      else resolve(result);
    });
    stream.end(buffer);
  });
}

async function storeTemporaryArtwork(buffer, { session, generationId }) {
  configure();
  const folder = `${String(process.env.CLOUDINARY_FOLDER || 'uploads').replace(/[^a-zA-Z0-9/_-]/g, '')}/ai-designer-temp`;
  const publicId = `${folder}/${String(generationId).replace(/[^a-zA-Z0-9_-]/g, '')}/${crypto.randomUUID()}`;
  const result = await uploadBuffer(buffer, {
    public_id: publicId,
    resource_type: 'image',
    type: 'authenticated',
    format: 'jpg',
    overwrite: false,
    tags: ['ai-designer-temporary'],
    context: { expires_at: new Date(Date.now() + TEMP_TTL_SECONDS * 1000).toISOString() },
  });
  return signPayload({
    publicId: result.public_id,
    version: result.version,
    format: result.format || 'jpg',
    sub: subjectHash(session),
    exp: Math.floor(Date.now() / 1000) + TEMP_TTL_SECONDS,
  });
}

async function readTemporaryArtwork(reference, session) {
  configure();
  const payload = readPayload(reference, session);
  if (!payload) {
    const error = new Error('The editable artwork reference is invalid or expired.');
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  const url = cloudinary.url(payload.publicId, {
    resource_type: 'image',
    type: 'authenticated',
    version: payload.version,
    format: payload.format,
    secure: true,
    sign_url: true,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'image/jpeg' } });
    if (!response.ok) throw new Error('Temporary artwork could not be retrieved.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error('Temporary artwork is invalid.');
    return { buffer, mimeType: 'image/jpeg' };
  } catch {
    const error = new Error('The editable artwork could not be retrieved safely.');
    error.code = 'INVALID_IMAGE';
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupTemporaryArtwork() {
  configure();
  const folder = `${String(process.env.CLOUDINARY_FOLDER || 'uploads').replace(/[^a-zA-Z0-9/_-]/g, '')}/ai-designer-temp`;
  const cutoff = Date.now() - TEMP_TTL_SECONDS * 1000;
  let nextCursor;
  let deleted = 0;
  do {
    const page = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'authenticated',
      prefix: folder,
      max_results: 100,
      next_cursor: nextCursor,
      tags: true,
      context: true,
    });
    const expired = (page.resources || [])
      .filter((asset) => new Date(asset.created_at).getTime() < cutoff)
      .map((asset) => asset.public_id);
    if (expired.length) {
      await cloudinary.api.delete_resources(expired, { resource_type: 'image', type: 'authenticated', invalidate: true });
      deleted += expired.length;
    }
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return deleted;
}

module.exports = {
  isTemporaryStorageConfigured,
  storeTemporaryArtwork,
  readTemporaryArtwork,
  cleanupTemporaryArtwork,
};
