const crypto = require('crypto');
const sharp = require('sharp');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');

const RENDERER_VERSION = 'production-pdf-v2';

function parseScene(scene) {
  return typeof scene === 'string' ? JSON.parse(scene) : scene;
}

function sceneHash(scene) {
  return crypto.createHash('sha256').update(JSON.stringify(scene)).digest('hex');
}

function assertProductionUrl(obj) {
  const url = obj?.source?.originalUrl;
  if (!url) throw new Error(`Missing production source for object ${obj?.id || '(unknown)'}`);
  if (url.startsWith('data:') || url.startsWith('blob:')) throw new Error(`Invalid production source URL for object ${obj?.id || '(unknown)'}: ${url.slice(0, 5)}`);
  return url;
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch production asset ${url}: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

function hexToRgb(hex) {
  const clean = String(hex || '#ffffff').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, 'f').slice(0, 6);
  return rgb(parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255);
}

function rotatedLowerLeftForCenter(x, y, w, h, rotationDegrees) {
  const theta = (Number(rotationDegrees || 0) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    x: cx - ((w / 2) * Math.cos(theta) - (h / 2) * Math.sin(theta)),
    y: cy - ((w / 2) * Math.sin(theta) + (h / 2) * Math.cos(theta)),
  };
}

function effectiveResolution(obj) {
  const src = obj.source || {};
  if (src.isVector || src.mimeType === 'application/pdf' || src.format === 'pdf') {
    return { isVector: true, status: 'pass', effectivePpi: null, upscaling: false };
  }
  const ppiX = src.originalWidth && obj.widthIn ? src.originalWidth / obj.widthIn : null;
  const ppiY = src.originalHeight && obj.heightIn ? src.originalHeight / obj.heightIn : null;
  const effectivePpi = ppiX && ppiY ? Math.min(ppiX, ppiY) : null;
  return {
    isVector: false,
    originalWidth: src.originalWidth || null,
    originalHeight: src.originalHeight || null,
    placedWidthIn: obj.widthIn,
    placedHeightIn: obj.heightIn,
    effectivePpi,
    upscaling: effectivePpi != null && effectivePpi < 300,
    status: effectivePpi == null ? 'warning' : effectivePpi >= 150 ? (effectivePpi >= 300 ? 'pass' : 'warning') : 'fail',
  };
}

async function renderPrintSceneToPdfBuffer(sceneInput) {
  const scene = parseScene(sceneInput);
  if (!scene || scene.sceneVersion !== 2) throw new Error('Unsupported or missing version 2 print scene');
  const widthPt = Number(scene.widthIn) * 72;
  const heightPt = Number(scene.heightIn) * 72;
  if (!widthPt || !heightPt) throw new Error('Invalid print scene dimensions');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([widthPt, heightPt]);
  page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: hexToRgb(scene.backgroundColor) });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const metadata = { rendererVersion: RENDERER_VERSION, sceneHash: sceneHash(scene), resolution: [] };

  const objects = [...(scene.objects || [])].filter(o => o.visible !== false).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  for (const obj of objects) {
    const x = Number(obj.xIn || 0) * 72;
    const w = Number(obj.widthIn || 0) * 72;
    const h = Number(obj.heightIn || 0) * 72;
    const y = heightPt - (Number(obj.yIn || 0) * 72) - h;
    const opacity = obj.opacity == null ? 1 : Number(obj.opacity);
    const rotationDegrees = Number(obj.rotation || 0);
    const rotate = degrees(rotationDegrees);
    const drawOrigin = rotatedLowerLeftForCenter(x, y, w, h, rotationDegrees);

    if (obj.type === 'image') {
      const url = assertProductionUrl(obj);
      const buffer = await fetchBuffer(url);
      const source = obj.source || {};
      const isPdf = source.mimeType === 'application/pdf' || source.format === 'pdf' || source.isVector;
      metadata.resolution.push({ objectId: obj.id, ...effectiveResolution(obj) });
      if (isPdf) {
        const [embeddedPage] = await pdfDoc.embedPdf(buffer, [(Number(source.pdfPageNumber || 1) - 1)]);
        page.drawPage(embeddedPage, { x: drawOrigin.x, y: drawOrigin.y, width: w, height: h, rotate, opacity });
      } else {
        const fmt = String(source.format || source.mimeType || '').toLowerCase();
        const image = fmt.includes('png') ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
        page.drawImage(image, { x: drawOrigin.x, y: drawOrigin.y, width: w, height: h, rotate, opacity });
      }
    } else if (obj.type === 'text' && obj.text?.content) {
      page.drawText(String(obj.text.content), {
        x: drawOrigin.x,
        y: drawOrigin.y + h - (Number(obj.text.fontSize || 0.25) * 72),
        size: Number(obj.text.fontSize || 0.25) * 72,
        font,
        color: hexToRgb(obj.text.color || '#000000'),
        rotate,
        opacity,
      });
    } else if (obj.type === 'shape') {
      page.drawRectangle({ x: drawOrigin.x, y: drawOrigin.y, width: w, height: h, color: hexToRgb(obj.shape?.fill || '#000000'), borderColor: hexToRgb(obj.shape?.stroke || obj.shape?.fill || '#000000'), borderWidth: Number(obj.shape?.strokeWidth || 0), rotate, opacity });
    }
  }
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return { buffer: Buffer.from(bytes), metadata };
}

module.exports = { RENDERER_VERSION, renderPrintSceneToPdfBuffer, sceneHash, effectiveResolution, rotatedLowerLeftForCenter };
