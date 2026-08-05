'use strict';

const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');

const TEMP_TTL_SECONDS = 24 * 60 * 60;
const JOB_TTL_SECONDS = 2 * 60 * 60;

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

function readSignedPayload(reference) {
  const [encoded, signature] = String(reference || '').split('.');
  if (!encoded || !signature || !storageSecret()) return null;
  const expected = crypto.createHmac('sha256', storageSecret()).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!/^[-/a-zA-Z0-9_]+$/.test(payload.publicId || '')) return null;
    return payload;
  } catch {
    return null;
  }
}

function readPayload(reference, session) {
  const payload = readSignedPayload(reference);
  return payload?.sub === subjectHash(session) ? payload : null;
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

function jobFolder() {
  return `${String(process.env.CLOUDINARY_FOLDER || 'uploads').replace(/[^a-zA-Z0-9/_-]/g, '')}/ai-designer-jobs`;
}

function jobPayload(reference, session = null) {
  const payload = readSignedPayload(reference);
  if (!payload || payload.kind !== 'ai-designer-job' || !['brief', 'generate', 'edit'].includes(payload.action)) return null;
  if (session && payload.sub !== subjectHash(session)) return null;
  return payload;
}

async function uploadJobRecord(publicId, record) {
  const result = await uploadBuffer(Buffer.from(JSON.stringify(record)), {
    public_id: publicId,
    resource_type: 'raw',
    type: 'authenticated',
    overwrite: true,
    invalidate: true,
    tags: ['ai-designer-job'],
    context: { expires_at: new Date(Date.now() + JOB_TTL_SECONDS * 1000).toISOString() },
  });
  return result;
}

async function fetchJobRecord(payload) {
  configure();
  let asset;
  try {
    asset = await cloudinary.api.resource(payload.publicId, { resource_type: 'raw', type: 'authenticated' });
  } catch (error) {
    if (Number(error?.http_code || error?.status || 0) === 404) return null;
    throw error;
  }
  const url = cloudinary.url(payload.publicId, {
    resource_type: 'raw',
    type: 'authenticated',
    version: asset.version,
    secure: true,
    sign_url: true,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('AI job record could not be retrieved.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error('AI job record is invalid.');
    return JSON.parse(buffer.toString('utf8'));
  } finally {
    clearTimeout(timer);
  }
}

async function createJob({ session, action, request, jobId }) {
  configure();
  if (!['brief', 'generate', 'edit'].includes(action) || !/^[a-f0-9]{64}$/.test(String(jobId || ''))) {
    const error = new Error('Invalid AI job.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  const publicId = `${jobFolder()}/${jobId}`;
  const reference = signPayload({
    kind: 'ai-designer-job',
    publicId,
    action,
    sub: subjectHash(session),
    exp: Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS,
  });
  const existing = await fetchJobRecord(jobPayload(reference)).catch(() => null);
  if (existing) return { reference, record: existing, created: false };
  const now = new Date().toISOString();
  const record = {
    version: 1,
    jobId,
    action,
    status: 'queued',
    stage: action === 'brief' ? 'Queued for brief interpretation' : action === 'edit' ? 'Queued for image editing' : 'Queued for image generation',
    createdAt: now,
    updatedAt: now,
    session: { sub: String(session?.sub || '') },
    request,
  };
  await uploadJobRecord(publicId, record);
  return { reference, record, created: true };
}

async function readJob(reference, session) {
  const payload = jobPayload(reference, session);
  if (!payload) {
    const error = new Error('The AI job reference is invalid or expired.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  const record = await fetchJobRecord(payload);
  if (!record) {
    const error = new Error('The AI job is unavailable or expired.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  return record;
}

async function readJobInternal(reference) {
  const payload = jobPayload(reference);
  if (!payload) return null;
  return fetchJobRecord(payload);
}

async function writeJobInternal(reference, record) {
  const payload = jobPayload(reference);
  if (!payload) {
    const error = new Error('Invalid AI job reference.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  await uploadJobRecord(payload.publicId, { ...record, updatedAt: new Date().toISOString() });
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

  nextCursor = undefined;
  do {
    const page = await cloudinary.api.resources({
      resource_type: 'raw',
      type: 'authenticated',
      prefix: jobFolder(),
      max_results: 100,
      next_cursor: nextCursor,
    });
    const expired = (page.resources || [])
      .filter((asset) => new Date(asset.created_at).getTime() < cutoff)
      .map((asset) => asset.public_id);
    if (expired.length) {
      await cloudinary.api.delete_resources(expired, { resource_type: 'raw', type: 'authenticated', invalidate: true });
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
  createJob,
  readJob,
  readJobInternal,
  writeJobInternal,
  cleanupTemporaryArtwork,
};
