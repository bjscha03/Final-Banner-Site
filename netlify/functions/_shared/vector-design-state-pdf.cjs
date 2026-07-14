const { PDFDocument, degrees, rgb } = require('pdf-lib');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FETCH_TIMEOUT_MS = 30000;

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

function isPdfDesignState(designState) {
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
  const value = String(url);
  // Preserve the resource type (raw/image), remove transformation segments
  // between /upload/ and the version component when one is present.
  return value.replace(/\/upload\/(?:[^/]+\/)+(?=v\d+\/)/, '/upload/');
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Original PDF fetch failed (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const signatureWindow = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
    if (!signatureWindow.includes('%PDF-')) {
      throw new Error('Original artwork response was not a PDF');
    }
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOriginalPdfBuffer(designState) {
  const candidates = [];
  const sourceUrl = designState.originalImageUrl;
  const sourceKey = designState.originalImageFileKey;

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    candidates.push(stripCloudinaryTransforms(sourceUrl));
  }

  if (sourceKey) {
    const key = String(sourceKey);
    const keyWithExtension = /\.pdf$/i.test(key) ? key : `${key}.pdf`;
    candidates.push(cloudinary.url(key, { resource_type: 'raw', type: 'upload', secure: true }));
    if (keyWithExtension !== key) {
      candidates.push(cloudinary.url(keyWithExtension, { resource_type: 'raw', type: 'upload', secure: true }));
    }
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  if (!uniqueCandidates.length) {
    throw new Error('Saved design state does not contain an original PDF URL or file key');
  }

  let lastError = null;
  for (const candidate of uniqueCandidates) {
    try {
      return await fetchBuffer(candidate);
    } catch (error) {
      lastError = error;
      console.warn('[VECTOR_DESIGN_PDF] original PDF candidate failed', {
        hasUrl: !!candidate,
        error: error && error.message,
      });
    }
  }

  throw lastError || new Error('Unable to retrieve original PDF artwork');
}

/**
 * Compose the original uploaded PDF page into a new banner-sized PDF without
 * rasterizing it. The embedded page remains a PDF Form XObject, so vector text,
 * lines, and shapes stay resolution-independent at any zoom or print size.
 */
async function renderVectorDesignStatePdf({
  designState,
  bannerWidthIn,
  bannerHeightIn,
  bleedIn = 0,
}) {
  if (!isPdfDesignState(designState)) {
    throw new Error('Saved design state is not a PDF artwork design');
  }

  const widthIn = Number(bannerWidthIn || designState.widthIn || 0);
  const heightIn = Number(bannerHeightIn || designState.heightIn || 0);
  const safeBleedIn = Math.max(0, Number(bleedIn || 0));
  if (!widthIn || !heightIn) {
    throw new Error('Banner width and height are required for vector PDF composition');
  }

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

  // Browser/CSS and Sharp use positive values for clockwise rotation. PDF uses
  // a bottom-left coordinate system with positive values counter-clockwise.
  const browserRotation = Number(designState.rotationDeg ?? designState.rotation ?? 0);
  const pdfRotation = -browserRotation;
  const theta = (pdfRotation * Math.PI) / 180;

  // pdf-lib rotates around the supplied lower-left draw origin. Solve for that
  // origin so the transformed artwork remains centered on the saved canvas
  // center, including non-uniform scaling.
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
      renderer: 'vector-design-state-v1',
      sourcePreservedAsVector: true,
      sourcePageWidthPt,
      sourcePageHeightPt,
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
  isPdfDesignState,
  fetchOriginalPdfBuffer,
  renderVectorDesignStatePdf,
};
