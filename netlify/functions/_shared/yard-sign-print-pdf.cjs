const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const DEFAULT_WIDTH_IN = 24;
const DEFAULT_HEIGHT_IN = 18;
const DEFAULT_DPI = 150;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_DESIGNS = 10;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseDesigns(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function decodeDataImage(value) {
  const match = String(value || '').match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  return match ? Buffer.from(match[1], 'base64') : null;
}

function isAllowedCloudinaryUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:'
      && (host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com'));
  } catch {
    return false;
  }
}

function buildHighResolutionSourceUrl(value, targetWidthPx) {
  const source = String(value || '').trim();
  if (!source || !isAllowedCloudinaryUrl(source)) return source;
  if (!/\.pdf(?:$|[?#])/i.test(source)) return source;
  if (!source.includes('/image/upload/')) return source;

  const width = Math.max(1800, Math.min(6000, Math.round(targetWidthPx)));
  const transformed = source.replace(
    '/image/upload/',
    `/image/upload/pg_1,f_jpg,q_100,w_${width},c_limit/`,
  );
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
}

async function fetchBuffer(value) {
  const dataBuffer = decodeDataImage(value);
  if (dataBuffer) return dataBuffer;
  if (!isAllowedCloudinaryUrl(value)) {
    throw new Error('Yard sign print source must be a permanent Cloudinary image URL');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(value, { signal: controller.signal });
    if (!response.ok) throw new Error(`Artwork fetch returned HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

function getTargetDimensions(widthIn = DEFAULT_WIDTH_IN, heightIn = DEFAULT_HEIGHT_IN, dpi = DEFAULT_DPI) {
  const normalizedWidthIn = Number(widthIn) > 0 ? Number(widthIn) : DEFAULT_WIDTH_IN;
  const normalizedHeightIn = Number(heightIn) > 0 ? Number(heightIn) : DEFAULT_HEIGHT_IN;
  const normalizedDpi = clamp(Number(dpi) || DEFAULT_DPI, 100, 200);
  return {
    widthIn: normalizedWidthIn,
    heightIn: normalizedHeightIn,
    dpi: normalizedDpi,
    widthPx: Math.max(1, Math.round(normalizedWidthIn * normalizedDpi)),
    heightPx: Math.max(1, Math.round(normalizedHeightIn * normalizedDpi)),
  };
}

function computePlacement({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  referenceWidth,
  referenceHeight,
  scaleX = 1,
  scaleY = scaleX,
  offsetX = 0,
  offsetY = 0,
}) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  const containedWidth = sourceAspect > targetAspect
    ? targetWidth
    : targetHeight * sourceAspect;
  const containedHeight = sourceAspect > targetAspect
    ? targetWidth / sourceAspect
    : targetHeight;

  const safeScaleX = clamp(Number(scaleX) || 1, 0.2, 5);
  const safeScaleY = clamp(Number(scaleY) || safeScaleX, 0.2, 5);
  const displayWidth = containedWidth * safeScaleX;
  const displayHeight = containedHeight * safeScaleY;
  const xRatio = Number(referenceWidth) > 0 ? (Number(offsetX) || 0) / Number(referenceWidth) : 0;
  const yRatio = Number(referenceHeight) > 0 ? (Number(offsetY) || 0) / Number(referenceHeight) : 0;
  const left = (targetWidth - displayWidth) / 2 + xRatio * targetWidth;
  const top = (targetHeight - displayHeight) / 2 + yRatio * targetHeight;

  return {
    left,
    top,
    displayWidth,
    displayHeight,
    visibleLeft: Math.max(0, left),
    visibleTop: Math.max(0, top),
    visibleRight: Math.min(targetWidth, left + displayWidth),
    visibleBottom: Math.min(targetHeight, top + displayHeight),
  };
}

async function getReferenceCanvasSize(design, targetWidth, targetHeight) {
  const previewUrl = design?.previewThumbnailUrl;
  if (previewUrl) {
    try {
      const previewBuffer = await fetchBuffer(previewUrl);
      const metadata = await sharp(previewBuffer, { failOn: 'none' }).metadata();
      const width = Number(metadata.width || 0);
      const height = Number(metadata.height || 0);
      if (width > 0 && height > 0) {
        // YardSignConfigurator saves the approved preview at pixelScale=2.
        return { width: width / 2, height: height / 2, source: 'approved-preview' };
      }
    } catch (error) {
      console.warn('[yard-sign-print] approved preview metadata unavailable', {
        error: error?.message || String(error),
      });
    }
  }

  // The editor's desktop reference frame is 533.33 × 400 for a 24 × 18 sign.
  // This fallback matters only for older orders that do not have the approved
  // preview snapshot used to recover the exact browser canvas dimensions.
  const fallbackHeight = 400;
  return {
    width: fallbackHeight * (targetWidth / targetHeight),
    height: fallbackHeight,
    source: 'default-reference',
  };
}

async function renderDesignToJpeg(design, dimensions) {
  const originalUrl = String(design?.fileUrl || '').trim();
  if (!originalUrl) throw new Error('Yard sign design is missing its original artwork URL');

  const printSourceUrl = buildHighResolutionSourceUrl(originalUrl, dimensions.widthPx * 1.2);
  const sourceBuffer = await fetchBuffer(printSourceUrl);
  const normalized = await sharp(sourceBuffer, { failOn: 'none' })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const sourceWidth = Number(normalized.info.width || 0);
  const sourceHeight = Number(normalized.info.height || 0);
  if (!sourceWidth || !sourceHeight) throw new Error('Original yard sign artwork has invalid dimensions');

  const reference = await getReferenceCanvasSize(design, dimensions.widthPx, dimensions.heightPx);
  const placement = computePlacement({
    sourceWidth,
    sourceHeight,
    targetWidth: dimensions.widthPx,
    targetHeight: dimensions.heightPx,
    referenceWidth: reference.width,
    referenceHeight: reference.height,
    scaleX: design?.imgScale ?? 1,
    scaleY: design?.imgScaleY ?? design?.imgScale ?? 1,
    offsetX: design?.imgPos?.x ?? 0,
    offsetY: design?.imgPos?.y ?? 0,
  });

  const visibleWidth = Math.max(0, Math.round(placement.visibleRight - placement.visibleLeft));
  const visibleHeight = Math.max(0, Math.round(placement.visibleBottom - placement.visibleTop));
  const background = sharp({
    create: {
      width: dimensions.widthPx,
      height: dimensions.heightPx,
      channels: 3,
      background: '#fafafa',
    },
  });

  if (visibleWidth <= 0 || visibleHeight <= 0) {
    return background.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  }

  const sourceLeftFloat = ((placement.visibleLeft - placement.left) / placement.displayWidth) * sourceWidth;
  const sourceTopFloat = ((placement.visibleTop - placement.top) / placement.displayHeight) * sourceHeight;
  const sourceRightFloat = ((placement.visibleRight - placement.left) / placement.displayWidth) * sourceWidth;
  const sourceBottomFloat = ((placement.visibleBottom - placement.top) / placement.displayHeight) * sourceHeight;

  const sourceLeft = clamp(Math.floor(sourceLeftFloat), 0, Math.max(0, sourceWidth - 1));
  const sourceTop = clamp(Math.floor(sourceTopFloat), 0, Math.max(0, sourceHeight - 1));
  const sourceRight = clamp(Math.ceil(sourceRightFloat), sourceLeft + 1, sourceWidth);
  const sourceBottom = clamp(Math.ceil(sourceBottomFloat), sourceTop + 1, sourceHeight);

  const visibleArtwork = await sharp(normalized.data, { failOn: 'none' })
    .extract({
      left: sourceLeft,
      top: sourceTop,
      width: Math.max(1, sourceRight - sourceLeft),
      height: Math.max(1, sourceBottom - sourceTop),
    })
    .resize(visibleWidth, visibleHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();

  return background
    .composite([{
      input: visibleArtwork,
      left: Math.max(0, Math.round(placement.visibleLeft)),
      top: Math.max(0, Math.round(placement.visibleTop)),
    }])
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
}

async function renderYardSignPrintPdf({
  designs,
  widthIn = DEFAULT_WIDTH_IN,
  heightIn = DEFAULT_HEIGHT_IN,
  dpi = DEFAULT_DPI,
  orderId,
} = {}) {
  const normalizedDesigns = parseDesigns(designs).slice(0, MAX_DESIGNS);
  if (!normalizedDesigns.length) throw new Error('No yard sign designs are available for print rendering');

  const dimensions = getTargetDimensions(widthIn, heightIn, dpi);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Banners On The Fly Yard Sign Order ${orderId || ''}`.trim());
  pdf.setProducer('Banners On The Fly high-resolution yard sign renderer');
  pdf.setCreator('Banners On The Fly');

  const pageWidthPt = dimensions.widthIn * 72;
  const pageHeightPt = dimensions.heightIn * 72;

  for (const design of normalizedDesigns) {
    const jpeg = await renderDesignToJpeg(design, dimensions);
    const image = await pdf.embedJpg(jpeg);
    const page = pdf.addPage([pageWidthPt, pageHeightPt]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    });
  }

  return {
    buffer: Buffer.from(await pdf.save({ useObjectStreams: true })),
    pageCount: normalizedDesigns.length,
    dpi: dimensions.dpi,
    widthPx: dimensions.widthPx,
    heightPx: dimensions.heightPx,
  };
}

module.exports = {
  renderYardSignPrintPdf,
  _test: {
    parseDesigns,
    buildHighResolutionSourceUrl,
    getTargetDimensions,
    computePlacement,
  },
};
