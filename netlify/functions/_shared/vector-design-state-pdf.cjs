const { PDFDocument, degrees, rgb } = require('pdf-lib');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FETCH_TIMEOUT_MS = 30_000;
const SIGNED_URL_EXPIRY_SECONDS = 10 * 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseHexColor(value) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(value || ''));
  if (!match) return rgb(250 / 255, 250 / 255, 250 / 255);
  return rgb(
    parseInt(match[1], 16) / 255,
    parseInt(match[2], 16) / 255,
    parseInt(match[3], 16) / 255,
  );
}

function parseDesignState(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPdfDesignState(value) {
  const designState = parseDesignState(value);
  if (!designState || typeof designState !== 'object') return false;
  if (designState.isPdf === true) return true;
  const source = String(
    designState.originalImageUrl
      || designState.originalImageFileKey
      || designState.originalFormat
      || '',
  ).toLowerCase();
  return source.endsWith('.pdf') || source === 'pdf';
}

function stripCloudinaryTransforms(url) {
  if (!url || !String(url).includes('res.cloudinary.com')) return url;
  return String(url).replace(/\/upload\/(?:[^/]+\/)+(?=v\d+\/)/, '/upload/');
}

function parseCloudinaryUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'cloudinary.com' && !host.endsWith('.cloudinary.com')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4) return null;
    const resourceType = segments[1] || 'raw';
    const deliveryType = segments[2] || 'upload';
    const rest = segments.slice(3).filter((segment) => !/^v\d+$/.test(segment));
    const idWithExtension = rest.join('/');
    if (!idWithExtension) return null;
    const dot = idWithExtension.lastIndexOf('.');
    return {
      resourceType,
      deliveryType,
      publicId: dot > -1 ? idWithExtension.slice(0, dot) : idWithExtension,
      format: dot > -1 ? idWithExtension.slice(dot + 1).toLowerCase() : 'pdf',
    };
  } catch {
    return null;
  }
}

async function fetchPdfBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Original PDF fetch failed (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const signatureWindow = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
    if (!signatureWindow.includes('%PDF-')) throw new Error('Original artwork response was not a PDF');
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

function signedCloudinaryCandidate(url) {
  const parsed = parseCloudinaryUrl(url);
  if (!parsed || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return null;
  try {
    return cloudinary.utils.private_download_url(parsed.publicId, parsed.format || 'pdf', {
      resource_type: parsed.resourceType || 'raw',
      type: parsed.deliveryType || 'upload',
      expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRY_SECONDS,
    });
  } catch {
    return null;
  }
}

async function fetchOriginalPdfBuffer(value) {
  const designState = parseDesignState(value);
  if (!designState) throw new Error('Saved design state is missing');

  const sourceUrl = designState.originalImageUrl;
  const sourceKey = designState.originalImageFileKey;
  const candidates = [];

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    const originalUrl = stripCloudinaryTransforms(sourceUrl);
    candidates.push(originalUrl);
    const signed = signedCloudinaryCandidate(originalUrl);
    if (signed) candidates.push(signed);
  }

  if (sourceKey) {
    const key = String(sourceKey);
    const rawUrl = cloudinary.url(key, { resource_type: 'raw', type: 'upload', secure: true });
    candidates.push(rawUrl);
    if (!/\.pdf$/i.test(key)) {
      candidates.push(cloudinary.url(`${key}.pdf`, { resource_type: 'raw', type: 'upload', secure: true }));
    }

    if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const baseId = key.replace(/\.pdf$/i, '');
      try {
        candidates.push(cloudinary.utils.private_download_url(baseId, 'pdf', {
          resource_type: 'raw',
          type: 'upload',
          expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRY_SECONDS,
        }));
      } catch {
        // direct URL candidates remain available
      }
    }
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  if (!uniqueCandidates.length) {
    throw new Error('Saved design state does not contain an original PDF URL or file key');
  }

  let lastError = null;
  for (const candidate of uniqueCandidates) {
    try {
      return await fetchPdfBuffer(candidate);
    } catch (error) {
      lastError = error;
      console.warn('[VECTOR_DESIGN_PDF] original PDF candidate failed', {
        candidateType: candidate.includes('api_key=') ? 'signed' : 'direct',
        error: error && error.message,
      });
    }
  }

  throw lastError || new Error('Unable to retrieve original PDF artwork');
}

/**
 * Compose the original uploaded PDF page into a new banner-sized PDF without
 * rasterizing it. The embedded page remains a PDF Form XObject, so text, lines,
 * and shapes remain resolution-independent at any zoom or print size.
 */
async function renderVectorDesignStatePdf({
  designState: rawDesignState,
  bannerWidthIn,
  bannerHeightIn,
  bleedIn = 0,
}) {
  const designState = parseDesignState(rawDesignState);
  if (!isPdfDesignState(designState)) throw new Error('Saved design state is not PDF artwork');

  const widthIn = Number(bannerWidthIn || designState.widthIn || 0);
  const heightIn = Number(bannerHeightIn || designState.heightIn || 0);
  const safeBleedIn = Math.max(0, Number(bleedIn || 0));
  if (!widthIn || !heightIn) throw new Error('Banner width and height are required for vector PDF composition');

  const originalPdfBytes = await fetchOriginalPdfBuffer(designState);
  const outputPdf = await PDFDocument.create();
  const [embeddedPage] = await outputPdf.embedPdf(originalPdfBytes, [0]);

  const bannerWidthPt = widthIn * 72;
  const bannerHeightPt = heightIn * 72;
  const bleedPt = safeBleedIn * 72;
  const pageWidthPt = bannerWidthPt + bleedPt * 2;
  const pageHeightPt = bannerHeightPt + bleedPt * 2;
  const page = outputPdf.addPage([pageWidthPt, pageHeightPt]);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidthPt,
    height: pageHeightPt,
    color: parseHexColor(designState.bgColor || designState.backgroundColor || '#fafafa'),
  });

  const sourceWidthPt = embeddedPage.width || 1;
  const sourceHeightPt = embeddedPage.height || 1;
  const fitMode = designState.fitMode === 'fill' ? 'fill' : 'fit';
  const baseScale = fitMode === 'fill'
    ? Math.max(bannerWidthPt / sourceWidthPt, bannerHeightPt / sourceHeightPt)
    : Math.min(bannerWidthPt / sourceWidthPt, bannerHeightPt / sourceHeightPt);

  const scaleX = Number(designState.scaleX ?? designState.imgScale ?? 1);
  const scaleY = Number(
    designState.scaleY
      ?? designState.imgScaleY
      ?? designState.imgScale
      ?? 1,
  );
  const drawWidthPt = Math.max(0.01, sourceWidthPt * baseScale * scaleX);
  const drawHeightPt = Math.max(0.01, sourceHeightPt * baseScale * scaleY);

  const position = designState.imgPos || designState.position || { x: 0, y: 0 };
  const translateXPt = (Number(position.x || 0) / 100) * bannerWidthPt;
  const translateYTopPt = (Number(position.y || 0) / 100) * bannerHeightPt;
  const centerXPt = bleedPt + bannerWidthPt / 2 + translateXPt;
  const centerYFromTopPt = bleedPt + bannerHeightPt / 2 + translateYTopPt;
  const centerYPdfPt = pageHeightPt - centerYFromTopPt;

  const browserRotation = Number(designState.rotationDeg ?? designState.rotation ?? 0);
  const pdfRotation = -browserRotation;
  const theta = (pdfRotation * Math.PI) / 180;

  const drawX = centerXPt
    - Math.cos(theta) * drawWidthPt / 2
    + Math.sin(theta) * drawHeightPt / 2;
  const drawY = centerYPdfPt
    - Math.sin(theta) * drawWidthPt / 2
    - Math.cos(theta) * drawHeightPt / 2;

  page.drawPage(embeddedPage, {
    x: drawX,
    y: drawY,
    width: drawWidthPt,
    height: drawHeightPt,
    rotate: degrees(pdfRotation),
    opacity: clamp(Number(designState.opacity ?? 1), 0, 1),
  });

  outputPdf.setTitle('Banners On The Fly - Vector Print PDF');
  outputPdf.setCreator('Banners On The Fly vector design-state renderer');
  outputPdf.setProducer('pdf-lib');
  outputPdf.setSubject('Print-ready banner composed from original uploaded PDF artwork');

  const bytes = await outputPdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 50,
  });

  return {
    buffer: Buffer.from(bytes),
    metadata: {
      renderer: 'vector-design-state-v2',
      sourcePreservedAsVector: true,
      sourcePageWidthPt: sourceWidthPt,
      sourcePageHeightPt: sourceHeightPt,
      pageWidthPt,
      pageHeightPt,
      drawX,
      drawY,
      drawWidthPt,
      drawHeightPt,
      rotationDeg: browserRotation,
      scaleX,
      scaleY,
      fitMode,
    },
  };
}

module.exports = {
  parseDesignState,
  isPdfDesignState,
  fetchOriginalPdfBuffer,
  renderVectorDesignStatePdf,
};
