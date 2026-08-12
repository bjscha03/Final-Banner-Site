'use strict';

const CLOUDINARY_DELIVERY_HOST = 'res.cloudinary.com';
const MANUAL_ARTWORK_PUBLIC_FOLDER = 'outbound-sales/manual-company-banners';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/i;

function publicationError(message) {
  return Object.assign(new Error(message), { code: 'MANUAL_ARTWORK_PUBLICATION_FAILED' });
}

function manualArtworkPublicId(prospectId, contentHash) {
  const safeProspectId = String(prospectId || '').trim().toLowerCase();
  const safeContentHash = String(contentHash || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(safeProspectId) || !CONTENT_HASH_PATTERN.test(safeContentHash)) {
    throw publicationError('The reviewed banner could not be bound to a public email image.');
  }
  return `${MANUAL_ARTWORK_PUBLIC_FOLDER}/${safeProspectId}/${safeContentHash}`;
}

function trustedCloudinaryUrl(value, { cloudName, publicId } = {}) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:'
        || parsed.hostname !== CLOUDINARY_DELIVERY_HOST
        || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    const expectedCloudName = String(cloudName || '').trim();
    const expectedPublicId = String(publicId || '').trim();
    if (!/^[a-z0-9_-]{1,100}$/i.test(expectedCloudName) || !expectedPublicId) return false;
    const decodedPath = decodeURIComponent(parsed.pathname);
    return decodedPath.startsWith(`/${expectedCloudName}/image/upload/`)
      && decodedPath.endsWith(`/${expectedPublicId}.jpg`);
  } catch {
    return false;
  }
}

function manualArtworkDeliveryReady(asset, expected = {}) {
  let expectedPublicId;
  try {
    expectedPublicId = manualArtworkPublicId(expected.prospectId, expected.contentHash);
  } catch {
    return false;
  }
  return asset?.provider === 'cloudinary'
    && asset?.deliveryType === 'upload'
    && asset?.publicationAudit?.passed === true
    && asset?.publicationAudit?.publiclyHosted === true
    && asset?.publicationAudit?.emailEmbeddable === true
    && asset?.publicId === expectedPublicId
    && asset?.contentHash === String(expected.contentHash || '').toLowerCase()
    && Number(asset?.width) === Number(expected.width)
    && Number(asset?.height) === Number(expected.height)
    && ['jpg', 'jpeg'].includes(String(asset?.format || '').toLowerCase())
    && trustedCloudinaryUrl(asset?.secureUrl, {
      cloudName: asset?.cloudName,
      publicId: expectedPublicId,
    });
}

function cloudinaryConfiguration(env = process.env) {
  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(env.CLOUDINARY_API_SECRET || '').trim();
  if (!/^[a-z0-9_-]{1,100}$/i.test(cloudName) || !apiKey || apiSecret.length < 8) {
    throw publicationError('Permanent public image hosting is unavailable on this deploy.');
  }
  return { cloudName, apiKey, apiSecret };
}

async function publishManualArtworkImage(options = {}) {
  if (!Buffer.isBuffer(options.buffer) || options.buffer.length < 1024) {
    throw publicationError('The reviewed banner image is unavailable for public hosting.');
  }
  const contentHash = String(options.contentHash || '').trim().toLowerCase();
  const publicId = manualArtworkPublicId(options.prospectId, contentHash);
  const config = cloudinaryConfiguration(options.env || process.env);
  const cloudinary = options.cloudinary || require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        resource_type: 'image',
        type: 'upload',
        public_id: publicId,
        format: 'jpg',
        overwrite: true,
        unique_filename: false,
        use_filename: false,
        invalidate: false,
      }, (error, uploaded) => {
        if (error) reject(error);
        else if (uploaded) resolve(uploaded);
        else reject(new Error('Cloudinary returned no image.'));
      });
      stream.end(options.buffer);
    });
  } catch {
    throw publicationError('The banner could not be placed on permanent public image hosting. Nothing was sent.');
  }

  const asset = {
    provider: 'cloudinary',
    deliveryType: 'upload',
    cloudName: config.cloudName,
    publicId: String(result.public_id || ''),
    secureUrl: String(result.secure_url || ''),
    assetId: String(result.asset_id || ''),
    version: Number(result.version) || null,
    format: String(result.format || '').toLowerCase(),
    width: Number(result.width) || null,
    height: Number(result.height) || null,
    bytes: Number(result.bytes) || null,
    contentHash,
    publicationAudit: {
      passed: true,
      publiclyHosted: true,
      emailEmbeddable: true,
    },
  };
  if (!manualArtworkDeliveryReady(asset, {
    prospectId: options.prospectId,
    contentHash,
    width: options.width,
    height: options.height,
  })) {
    throw publicationError('The public banner image did not match the reviewed company upload. Nothing was sent.');
  }
  return asset;
}

module.exports = {
  CLOUDINARY_DELIVERY_HOST,
  MANUAL_ARTWORK_PUBLIC_FOLDER,
  manualArtworkPublicId,
  trustedCloudinaryUrl,
  manualArtworkDeliveryReady,
  cloudinaryConfiguration,
  publishManualArtworkImage,
};
