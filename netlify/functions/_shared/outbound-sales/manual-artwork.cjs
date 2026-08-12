'use strict';

const crypto = require('node:crypto');
const repository = require('./manual-artwork-repository.cjs');
const delivery = require('./manual-artwork-delivery.cjs');

const MANUAL_ARTWORK_STORE_NAME = 'outbound-company-mockups';
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MIN_SOURCE_WIDTH = 900;
const MIN_SOURCE_HEIGHT = 500;

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function cleanText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function manualArtworkError(message, code = 'INVALID_MANUAL_ARTWORK') {
  return Object.assign(new Error(message), { code });
}

async function blobBuffer(store, key) {
  if (!store || !key) return null;
  const value = await store.get(key, { type: 'arrayBuffer' });
  return value ? Buffer.from(value) : null;
}

async function normalizeManualArtwork(sourceBuffer, sharpImpl) {
  if (!Buffer.isBuffer(sourceBuffer) || sourceBuffer.length < 1024) {
    throw manualArtworkError('Choose a valid PNG, JPG, or WebP image.');
  }
  if (sourceBuffer.length > MAX_SOURCE_BYTES) {
    throw manualArtworkError('The image is larger than 4 MB. Export a high-quality JPG and try again.', 'MANUAL_ARTWORK_TOO_LARGE');
  }
  if (typeof sharpImpl !== 'function') {
    throw manualArtworkError('Image processing is unavailable on this deploy.', 'MANUAL_ARTWORK_PROCESSING_UNAVAILABLE');
  }
  let metadata;
  try {
    metadata = await sharpImpl(sourceBuffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw manualArtworkError('The uploaded image could not be decoded. Use a standard PNG, JPG, or WebP file.');
  }
  if (!['jpeg', 'png', 'webp'].includes(String(metadata.format || ''))) {
    throw manualArtworkError('Only PNG, JPG, and WebP banner images are accepted.');
  }
  const sourceWidth = Number(metadata.width) || 0;
  const sourceHeight = Number(metadata.height) || 0;
  if (sourceWidth < MIN_SOURCE_WIDTH || sourceHeight < MIN_SOURCE_HEIGHT) {
    throw manualArtworkError(`The image is too small. Use at least ${MIN_SOURCE_WIDTH}×${MIN_SOURCE_HEIGHT} pixels so the email preview stays sharp.`, 'MANUAL_ARTWORK_TOO_SMALL');
  }
  const buffer = await sharpImpl(sourceBuffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(repository.MANUAL_ARTWORK_WIDTH, repository.MANUAL_ARTWORK_HEIGHT, {
      fit: 'contain',
      position: 'centre',
      background: { r: 248, g: 250, b: 252, alpha: 1 },
      kernel: 'lanczos3',
    })
    .flatten({ background: '#f8fafc' })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  return {
    buffer,
    source: {
      format: metadata.format,
      width: sourceWidth,
      height: sourceHeight,
      bytes: sourceBuffer.length,
    },
  };
}

function assertUploadCandidate(candidate) {
  if (!candidate?.prospect?.id) {
    throw manualArtworkError('This lead could not be found.', 'MANUAL_ARTWORK_NOT_FOUND');
  }
  if (!candidate.contact?.id || !candidate.message?.id) {
    throw manualArtworkError('Generate the lead’s email draft before uploading its banner image.', 'MANUAL_ARTWORK_MESSAGE_REQUIRED');
  }
  if (candidate.message.contactId !== candidate.contact.id
      || candidate.message.generationStatus !== 'generated'
      || candidate.message.evidenceValidationStatus !== 'passed'
      || candidate.message.status !== 'draft'
      || !/^[a-f0-9]{64}$/i.test(String(candidate.message.contentHash || ''))) {
    throw manualArtworkError('The current email draft is not ready for a securely bound banner upload.', 'MANUAL_ARTWORK_MESSAGE_REQUIRED');
  }
}

async function uploadManualArtwork(options) {
  const dependencies = { ...repository, ...delivery, ...options.dependencies };
  const candidate = options.candidate
    || await dependencies.loadManualArtworkCandidate(options.sql, options.prospectId);
  assertUploadCandidate(candidate);
  const normalized = await normalizeManualArtwork(options.sourceBuffer, options.sharp);
  const contentHash = sha256(normalized.buffer);
  const blobKey = `manual-company-banners/${candidate.prospect.id}/${contentHash}.jpg`;
  if (!options.store) {
    throw manualArtworkError('Permanent image storage is unavailable on this deploy.', 'MANUAL_ARTWORK_STORAGE_FAILED');
  }
  await options.store.set(blobKey, normalized.buffer, {
    metadata: {
      contentType: 'image/jpeg',
      prospectId: candidate.prospect.id,
      messageId: candidate.message.id,
      renderVersion: repository.MANUAL_ARTWORK_RENDER_VERSION,
      contentHash,
    },
  });
  const persisted = await blobBuffer(options.store, blobKey);
  const persistedContentHash = persisted ? sha256(persisted) : null;
  const blobBindingAudit = {
    passed: persistedContentHash === contentHash,
    blobKey,
    expectedContentHash: contentHash,
    persistedContentHash,
    strongReadBackVerified: persistedContentHash === contentHash,
  };
  if (!blobBindingAudit.passed) {
    throw manualArtworkError('The uploaded image could not be verified after storage. Nothing was changed.', 'MANUAL_ARTWORK_STORAGE_FAILED');
  }
  const emailImageDelivery = await dependencies.publishManualArtworkImage({
    buffer: normalized.buffer,
    prospectId: candidate.prospect.id,
    contentHash,
    width: repository.MANUAL_ARTWORK_WIDTH,
    height: repository.MANUAL_ARTWORK_HEIGHT,
    env: options.env || process.env,
    cloudinary: options.cloudinary,
  });
  const uploadedAt = new Date().toISOString();
  const generationMetadata = {
    source: 'manual_upload',
    messageContentHash: candidate.message.contentHash,
    manualReviewAudit: {
      passed: true,
      administratorUploaded: true,
      uploadedBy: cleanText(options.uploadedBy, 200) || null,
      uploadedAt,
      originalFilename: cleanText(options.originalFilename, 180) || null,
    },
    imageAudit: {
      passed: true,
      format: 'jpeg',
      width: repository.MANUAL_ARTWORK_WIDTH,
      height: repository.MANUAL_ARTWORK_HEIGHT,
      fit: 'contain',
      noCrop: true,
      sourceFormat: normalized.source.format,
      sourceWidth: normalized.source.width,
      sourceHeight: normalized.source.height,
      sourceBytes: normalized.source.bytes,
    },
    blobBindingAudit,
    emailImageDelivery,
    emailImageReady: true,
  };
  const row = await dependencies.saveManualArtwork(options.sql, {
    prospectId: candidate.prospect.id,
    messageId: candidate.message.id,
    contentHash,
    blobKey,
    eventLabel: cleanText(options.eventLabel, 240) || null,
    generationMetadata,
  });
  if (!row) {
    throw manualArtworkError('The uploaded image could not be attached to this lead. Nothing was sent.', 'MANUAL_ARTWORK_STORAGE_FAILED');
  }
  await dependencies.refreshManualArtworkBatchCount(options.sql, candidate.prospect.id).catch(() => null);
  return {
    prospectId: candidate.prospect.id,
    businessName: candidate.prospect.businessName,
    buffer: normalized.buffer,
    contentHash,
    blobKey,
    mimeType: 'image/jpeg',
    width: repository.MANUAL_ARTWORK_WIDTH,
    height: repository.MANUAL_ARTWORK_HEIGHT,
    messageId: candidate.message.id,
    messageContentHash: candidate.message.contentHash,
    generationMetadata,
    publicUrl: emailImageDelivery.secureUrl,
    deliveryAsset: emailImageDelivery,
    emailImageReady: true,
    sendReady: true,
    cached: false,
    row,
  };
}

async function loadVerifiedManualArtwork(options) {
  const dependencies = { ...repository, ...options.dependencies };
  const candidate = options.candidate
    || await dependencies.loadManualArtworkCandidate(options.sql, options.prospectId);
  assertUploadCandidate(candidate);
  const artwork = candidate.artwork;
  if (!dependencies.manualArtworkReady({
    prospectId: candidate.prospect.id,
    status: artwork?.status,
    renderVersion: artwork?.renderVersion,
    contentHash: artwork?.contentHash,
    blobKey: artwork?.blobKey,
    qualityLevel: artwork?.qualityLevel,
    messageId: artwork?.messageId,
    expectedMessageId: candidate.message.id,
    expectedMessageContentHash: candidate.message.contentHash,
    generationMetadata: artwork?.generationMetadata,
  })) {
    throw manualArtworkError('Upload and review a banner image for this company before sending.', 'MANUAL_ARTWORK_NOT_READY');
  }
  const buffer = await blobBuffer(options.store, artwork.blobKey);
  if (!buffer || sha256(buffer) !== artwork.contentHash) {
    throw manualArtworkError('The saved banner image did not match the reviewed preview. Nothing was sent.', 'MANUAL_ARTWORK_NOT_READY');
  }
  let metadata;
  try {
    metadata = await options.sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw manualArtworkError('The saved banner image could not be verified. Nothing was sent.', 'MANUAL_ARTWORK_NOT_READY');
  }
  if (metadata.format !== 'jpeg'
      || metadata.width !== repository.MANUAL_ARTWORK_WIDTH
      || metadata.height !== repository.MANUAL_ARTWORK_HEIGHT) {
    throw manualArtworkError('The saved banner image dimensions changed after review. Nothing was sent.', 'MANUAL_ARTWORK_NOT_READY');
  }
  return {
    prospectId: candidate.prospect.id,
    businessName: candidate.prospect.businessName,
    buffer,
    contentHash: artwork.contentHash,
    blobKey: artwork.blobKey,
    mimeType: 'image/jpeg',
    width: repository.MANUAL_ARTWORK_WIDTH,
    height: repository.MANUAL_ARTWORK_HEIGHT,
    messageId: candidate.message.id,
    messageContentHash: candidate.message.contentHash,
    generationMetadata: artwork.generationMetadata,
    publicUrl: artwork.generationMetadata.emailImageDelivery.secureUrl,
    deliveryAsset: artwork.generationMetadata.emailImageDelivery,
    emailImageReady: true,
    sendReady: true,
    cached: true,
    row: artwork,
  };
}

module.exports = {
  MANUAL_ARTWORK_STORE_NAME,
  MAX_SOURCE_BYTES,
  MAX_INPUT_PIXELS,
  MIN_SOURCE_WIDTH,
  MIN_SOURCE_HEIGHT,
  sha256,
  normalizeManualArtwork,
  uploadManualArtwork,
  loadVerifiedManualArtwork,
};
