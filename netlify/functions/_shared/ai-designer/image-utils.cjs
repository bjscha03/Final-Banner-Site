'use strict';

const sharp = require('sharp');

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function planCanvas(widthIn, heightIn) {
  const scaledW = Math.max(1, Math.round(widthIn * 100));
  const scaledH = Math.max(1, Math.round(heightIn * 100));
  const divisor = gcd(scaledW, scaledH);
  const unitW = scaledW / divisor;
  const unitH = scaledH / divisor;
  const maxW = 3840;
  const maxH = 2160;
  const finalK = Math.floor(Math.min(maxW / (unitW * 16), maxH / (unitH * 16)));
  if (finalK < 1) {
    const error = new Error('This custom aspect ratio is outside the supported print canvas range.');
    error.code = 'INVALID_DIMENSIONS';
    throw error;
  }
  const finalWidth = unitW * 16 * finalK;
  const finalHeight = unitH * 16 * finalK;
  const ratio = widthIn / heightIn;
  let providerWidth = finalWidth;
  let providerHeight = finalHeight;
  let strategy = 'native-exact-ratio';
  let safeCorridor = 'the full provider canvas';

  if (ratio > 3) {
    providerWidth = finalWidth;
    providerHeight = Math.ceil((providerWidth / 3) / 16) * 16;
    strategy = 'gpt-image-2-outpainting';
    safeCorridor = `the central ${Math.round((finalHeight / providerHeight) * 100)}% of the canvas height`;
  } else if (ratio < 1 / 3) {
    providerHeight = finalHeight;
    providerWidth = Math.ceil((providerHeight / 3) / 16) * 16;
    strategy = 'gpt-image-2-outpainting';
    safeCorridor = `the central ${Math.round((finalWidth / providerWidth) * 100)}% of the canvas width`;
  }

  if (providerWidth > maxW || providerHeight > maxH) {
    const scale = Math.min(maxW / providerWidth, maxH / providerHeight);
    providerWidth = Math.max(16, Math.floor((providerWidth * scale) / 16) * 16);
    providerHeight = Math.max(16, Math.floor((providerHeight * scale) / 16) * 16);
  }

  return {
    ratio,
    finalWidth,
    finalHeight,
    providerWidth,
    providerHeight,
    providerSize: `${providerWidth}x${providerHeight}`,
    strategy,
    safeCorridor,
  };
}

async function prepareOutpaintInput(buffer, plan) {
  if (plan.strategy !== 'gpt-image-2-outpainting') return null;

  // Fit the complete nearest-native composition inside the exact target band.
  // The transparent area is then filled by GPT Image 2's edit endpoint. This
  // keeps all original content recoverable and avoids blind crop/fill behavior.
  const source = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(plan.finalWidth, plan.finalHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((plan.providerWidth - source.info.width) / 2);
  const top = Math.floor((plan.providerHeight - source.info.height) / 2);
  const input = await sharp({
    create: {
      width: plan.providerWidth,
      height: plan.providerHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: source.data, left, top }]).png().toBuffer();
  const mask = await sharp({
    create: {
      width: plan.providerWidth,
      height: plan.providerHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{
    input: {
      create: {
        width: source.info.width,
        height: source.info.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    },
    left,
    top,
  }]).png().toBuffer();
  return {
    image: input,
    mask,
    mimeType: 'image/png',
    placement: { left, top, width: source.info.width, height: source.info.height },
  };
}

function parseDataImage(value, maxBytes = 4 * 1024 * 1024) {
  if (!value) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(String(value));
  if (!match || !SUPPORTED_MIME.has(match[1])) {
    const error = new Error('Invalid image data.');
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > maxBytes) {
    const error = new Error('Image exceeds the permitted size.');
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  const signature = buffer.subarray(0, 12).toString('hex');
  const valid = match[1] === 'image/png'
    ? signature.startsWith('89504e470d0a1a0a')
    : match[1] === 'image/jpeg'
      ? signature.startsWith('ffd8ff')
      : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) {
    const error = new Error('Image signature does not match its MIME type.');
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  return { buffer, mimeType: match[1] };
}

async function validateInputImage(image, maxPixels = 30_000_000) {
  if (!image) return null;
  try {
    const metadata = await sharp(image.buffer, { limitInputPixels: maxPixels }).metadata();
    if (!SUPPORTED_MIME.has(`image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}`)) throw new Error('format');
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) throw new Error('dimensions');
    return { ...image, width: metadata.width, height: metadata.height };
  } catch {
    const error = new Error('Invalid image.');
    error.code = 'INVALID_IMAGE';
    throw error;
  }
}

async function normalizeBackground(buffer, plan) {
  let pipeline = sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(plan.providerWidth, plan.providerHeight, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' });
  if (plan.strategy === 'gpt-image-2-outpainting') {
    pipeline = pipeline.resize(plan.finalWidth, plan.finalHeight, { fit: 'cover', position: 'centre' });
  } else if (plan.providerWidth !== plan.finalWidth || plan.providerHeight !== plan.finalHeight) {
    pipeline = pipeline.resize(plan.finalWidth, plan.finalHeight, { fit: 'cover', position: 'centre' });
  }
  return pipeline.jpeg({ quality: 82, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
}

function toDataUrl(buffer, mimeType = 'image/jpeg') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

module.exports = {
  SUPPORTED_MIME,
  planCanvas,
  parseDataImage,
  validateInputImage,
  prepareOutpaintInput,
  normalizeBackground,
  toDataUrl,
};
