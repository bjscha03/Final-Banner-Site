'use strict';

const crypto = require('node:crypto');
const sharp = require('sharp');
const { v2: cloudinary } = require('cloudinary');
const { env } = require('./runtime.cjs');
const { buildCompositionSignatureFromPreview } = require('../preview-artifact.cjs');

const MAX_BYTES = 50 * 1024 * 1024;
const MIN_SOURCE_DPI = 100; // Matches the existing banner product registry.
const MAX_PRINT_PIXELS = 50_000_000;

function error(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
function configureCloudinary() {
  const cloudName = env('CLOUDINARY_CLOUD_NAME');
  const apiKey = env('CLOUDINARY_API_KEY');
  const apiSecret = env('CLOUDINARY_API_SECRET');
  if (!cloudName || !apiKey || !apiSecret) throw error('SMS_ARTWORK_STORAGE_UNAVAILABLE', 'Artwork storage is temporarily unavailable.', 503);
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}
async function limitedBuffer(response, limit = MAX_BYTES) {
  if (!response.ok) throw error('SMS_ARTWORK_DOWNLOAD_FAILED', 'The image could not be downloaded. Please resend it.', 503);
  if (Number(response.headers.get('content-length') || 0) > limit) throw error('SMS_ARTWORK_TOO_LARGE', 'Please upload an image smaller than 50MB.');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) {
      await response.body?.cancel?.().catch(() => {});
      throw error('SMS_ARTWORK_TOO_LARGE', 'Please upload an image smaller than 50MB.');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function isTwilioMediaUrl(value, accountSid) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'api.twilio.com' && !url.username && !url.password
      && new RegExp(`^/2010-04-01/Accounts/${accountSid}/Messages/(?:SM|MM)[a-f0-9]{32}/Media/ME[a-f0-9]{32}$`, 'i').test(url.pathname)
      && !url.search && !url.hash;
  } catch { return false; }
}
async function downloadTwilioMedia(url, config, fetcher = fetch) {
  if (!isTwilioMediaUrl(url, config.accountSid)) throw error('SMS_ARTWORK_URL_INVALID', 'The attachment is invalid. Please resend it.');
  let next = url;
  for (let index = 0; index < 4; index += 1) {
    const parsed = new URL(next);
    const allowed = parsed.protocol === 'https:' && !parsed.username && !parsed.password
      && (parsed.hostname === 'api.twilio.com' || parsed.hostname.endsWith('.twiliocdn.com') || parsed.hostname === 'twiliocdn.com');
    if (!allowed) throw error('SMS_ARTWORK_REDIRECT_INVALID', 'The attachment could not be safely downloaded.');
    const headers = parsed.hostname === 'api.twilio.com'
      ? { authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}` }
      : {};
    const response = await fetcher(next, { redirect: 'manual', headers, signal: AbortSignal.timeout(30000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      next = new URL(location, next).href;
      continue;
    }
    return limitedBuffer(response);
  }
  throw error('SMS_ARTWORK_DOWNLOAD_FAILED', 'The image could not be downloaded. Please resend it.');
}
async function downloadStoredImage(url, fetcher = fetch) {
  const { cloudName } = configureCloudinary();
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com'
      || !parsed.pathname.startsWith(`/${cloudName}/image/upload/`)) throw error('SMS_ARTWORK_URL_INVALID', 'Invalid artwork storage URL.');
  return limitedBuffer(await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000) }));
}
function uploadBuffer(buffer, publicId, format) {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: 'image', overwrite: false, format },
      (failure, result) => failure ? reject(error('SMS_ARTWORK_UPLOAD_FAILED', 'Artwork could not be saved. Please try again.', 503)) : resolve(result));
    stream.end(buffer);
  });
}
function dimensions(config) {
  const width = Number(config.width_in);
  const height = Number(config.height_in);
  const dpi = Math.min(100, 12000 / width, 12000 / height, Math.sqrt(MAX_PRINT_PIXELS / (width * height)));
  const widthPx = Math.max(1, Math.round(width * dpi));
  const heightPx = Math.max(1, Math.round(height * dpi));
  return { widthPx, heightPx, dpi: widthPx / width };
}
function sourceDpi(widthPx, heightPx, config) {
  const widthDpi = widthPx / config.width_in;
  const heightDpi = heightPx / config.height_in;
  return config.fit_mode === 'fit' ? Math.max(widthDpi, heightDpi) : Math.min(widthDpi, heightDpi);
}
async function inspectImage(buffer, config) {
  let metadata;
  try { metadata = await sharp(buffer, { limitInputPixels: 128_000_000, animated: false }).metadata(); }
  catch { throw error('SMS_ARTWORK_FORMAT_UNSUPPORTED', 'Please send a JPG, PNG, or WebP image.'); }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) {
    throw error('SMS_ARTWORK_FORMAT_UNSUPPORTED', 'Please send a single JPG, PNG, or WebP image.');
  }
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  const dpi = sourceDpi(width, height, config);
  if (dpi < MIN_SOURCE_DPI) {
    throw error('SMS_ARTWORK_LOW_RESOLUTION', `This image is about ${Math.floor(dpi)} DPI at your banner size. Please upload the original artwork (recommended ${Math.ceil(config.width_in * MIN_SOURCE_DPI)} x ${Math.ceil(config.height_in * MIN_SOURCE_DPI)} pixels).`);
  }
  return { ...metadata, width, height, sourceDpi: dpi };
}
async function renderArtwork(session, buffer, original = null, upload = uploadBuffer) {
  const metadata = await inspectImage(buffer, session.config);
  const revision = session.revision + 1;
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const base = `bof/text-orders/${session.id}/r${revision}-${hash.slice(0, 16)}-${crypto.randomBytes(5).toString('hex')}`;
  const originalAsset = original || await upload(buffer, `${base}-original`, metadata.format === 'jpeg' ? 'jpg' : metadata.format);
  const output = dimensions(session.config);
  const rendered = await sharp(buffer, { limitInputPixels: 128_000_000 }).rotate().flatten({ background: '#ffffff' })
    .resize(output.widthPx, output.heightPx, {
      fit: session.config.fit_mode === 'fit' ? 'contain' : 'cover', position: 'centre', background: '#ffffff',
    }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  const printAsset = await upload(rendered, `${base}-print`, 'jpg');
  // The phone preview is a downsample of the exact saved print image.
  const previewBuffer = await sharp(rendered).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toBuffer();
  const previewAsset = await upload(previewBuffer, `${base}-preview`, 'jpg');
  const placement = {
    version: 3, uploadStatus: 'uploaded', previewUrl: previewAsset.secure_url, previewPublicId: previewAsset.public_id,
    sourceUrl: originalAsset.secure_url, sourceIdentity: originalAsset.public_id, productType: 'banner',
    widthIn: session.config.width_in, heightIn: session.config.height_in, fitMode: session.config.fit_mode || 'fill',
    positionPct: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, compositionRevision: revision,
    previewWidthPx: previewAsset.width, previewHeightPx: previewAsset.height,
  };
  placement.compositionSignature = buildCompositionSignatureFromPreview(placement);
  return {
    originalUrl: originalAsset.secure_url, originalPublicId: originalAsset.public_id,
    originalFilename: `banner-artwork.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`,
    previewUrl: previewAsset.secure_url, printUrl: printAsset.secure_url, printPublicId: printAsset.public_id,
    ...output, sourceDpi: metadata.sourceDpi, placement,
    manifest: {
      originalUrl: originalAsset.secure_url, publicId: originalAsset.public_id, assetId: originalAsset.asset_id,
      version: originalAsset.version, resourceType: 'image', format: metadata.format,
      mimeType: `image/${metadata.format}`, bytes: buffer.length, width: metadata.width, height: metadata.height,
      sha256: hash, uploadStatus: 'uploaded', uploadedAt: new Date().toISOString(),
      originalFilename: `banner-artwork.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`,
    },
  };
}
function uploadSignature(session) {
  const { cloudName, apiKey, apiSecret } = configureCloudinary();
  const parameters = {
    public_id: `bof/text-orders/${session.id}/incoming-${crypto.randomBytes(16).toString('hex')}`,
    timestamp: Math.floor(Date.now() / 1000), overwrite: false,
  };
  return { uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, apiKey,
    signature: cloudinary.utils.api_sign_request(parameters, apiSecret), parameters, maxBytes: MAX_BYTES };
}
async function uploadedOriginal(session, publicId) {
  if (!new RegExp(`^bof/text-orders/${session.id}/incoming-[a-f0-9]{32}$`).test(String(publicId || ''))) throw error('SMS_ARTWORK_UPLOAD_INVALID', 'Invalid artwork upload.');
  configureCloudinary();
  const asset = await cloudinary.api.resource(publicId, { resource_type: 'image' });
  if (asset.bytes > MAX_BYTES || !['jpg', 'jpeg', 'png', 'webp'].includes(asset.format)) throw error('SMS_ARTWORK_FORMAT_UNSUPPORTED', 'Please upload a JPG, PNG, or WebP image smaller than 50MB.');
  return asset;
}

module.exports = { MAX_BYTES, MIN_SOURCE_DPI, dimensions, sourceDpi, inspectImage, isTwilioMediaUrl, downloadTwilioMedia, downloadStoredImage, renderArtwork, uploadSignature, uploadedOriginal, limitedBuffer };
