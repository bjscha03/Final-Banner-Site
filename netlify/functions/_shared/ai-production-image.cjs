'use strict';
const crypto = require('node:crypto');
const sharp = require('sharp');
const { toStoredOriginalPrintScene } = require('./stored-original-print-scene.cjs');
const { fetchBuffer } = require('./print-scene-renderer.cjs');
const VERSION = 'ai-jpeg-full-size-150-v1';
const DPI = 150;
const MAX_PIXELS = 100_000_000;
const { isAiArtwork } = require('./ai-artwork-kind.cjs');
function productionImagePlan(item) {
  if (!isAiArtwork(item)) throw new Error('This item has no saved AI artwork.');
  const state = typeof item.canvas_state_json === 'string' ? JSON.parse(item.canvas_state_json) : item.canvas_state_json;
  const originalUrl = item.artwork_manifest?.originalUrl || item.file_url;
  if (!state || state.originalImageUrl !== originalUrl) throw new Error('Saved artwork and layout do not match.');
  const scene = toStoredOriginalPrintScene(state, Number(item.width_in), Number(item.height_in));
  if (scene?.sceneVersion !== 2 || scene.objects?.length !== 1 || scene.objects[0].source?.originalUrl !== originalUrl) throw new Error('This AI layout cannot be exported automatically.');
  const width = Math.round(scene.widthIn * DPI), height = Math.round(scene.heightIn * DPI);
  if (width < 1 || height < 1 || width * height > MAX_PIXELS || width > 30000 || height > 30000) throw new Error('This size exceeds the automatic 150 DPI image export limit. Download the saved original artwork for production.');
  const hash = crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, scene, sha256: item.artwork_manifest?.sha256 })).digest('hex');
  return { scene, width, height, hash, filename: `ai-artwork-${item.id}-${scene.widthIn}x${scene.heightIn}in-150dpi.jpg` };
}
async function renderAiProductionImage(item, { fetchSource = fetchBuffer } = {}) {
  const plan = productionImagePlan(item);
  const { scene, width, height } = plan;
  const object = scene.objects[0];
  const original = await fetchSource(object.source.originalUrl, object.source);
  const meta = await sharp(original, { limitInputPixels: 150_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error('Unable to measure original image');
  const placedWidth = Math.round(object.widthIn * DPI), placedHeight = Math.round(object.heightIn * DPI);
  if (placedWidth < 1 || placedHeight < 1 || placedWidth * placedHeight > 150_000_000) throw new Error('The saved zoom exceeds the automatic image export limit.');
  const left = Math.round(object.xIn * DPI), top = Math.round(object.yIn * DPI);
  const crop = object.crop || { x: 0, y: 0, width: 1, height: 1 };
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
    || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) throw new Error('Invalid saved crop');
  const x0 = Math.max(0, left + Math.round(crop.x * placedWidth));
  const y0 = Math.max(0, top + Math.round(crop.y * placedHeight));
  const x1 = Math.min(width, left + Math.round((crop.x + crop.width) * placedWidth));
  const y1 = Math.min(height, top + Math.round((crop.y + crop.height) * placedHeight));
  if (x1 <= x0 || y1 <= y0) throw new Error('Saved artwork is outside the print area');
  // Preserve the customer-approved composition. No generative redraw or invented
  // detail; Lanczos resampling is explicitly reported separately from native PPI.
  let buffer;
  if (left === 0 && top === 0 && placedWidth === width && placedHeight === height
    && crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1) {
    // Common AI fit case: one streaming resize avoids an extra full-canvas PNG.
    buffer = await sharp(original).resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .flatten({ background: scene.backgroundColor || '#ffffff' }).withMetadata({ density: DPI })
      .jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
  } else {
    const layer = await sharp(original).resize(placedWidth, placedHeight, { fit: 'fill', kernel: 'lanczos3' })
      .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
    buffer = await sharp({ create: { width, height, channels: 3, background: scene.backgroundColor || '#ffffff' } })
      .composite([{ input: layer, left: x0, top: y0 }]).withMetadata({ density: DPI })
      .jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
  }
  const sourcePpi = Math.min(meta.width / object.widthIn, meta.height / object.heightIn);
  return { buffer, metadata: { version: VERSION, hash: plan.hash, filename: plan.filename,
    widthIn: scene.widthIn, heightIn: scene.heightIn, widthPx: width, heightPx: height,
    dpi: DPI, scale: '1:1', sourceWidth: meta.width, sourceHeight: meta.height,
    sourcePpi, resampled: meta.width !== placedWidth || meta.height !== placedHeight,
    interpolation: 'lanczos3', generatedAt: new Date().toISOString() } };
}
module.exports = { VERSION, DPI, isAiArtwork, productionImagePlan, renderAiProductionImage };
