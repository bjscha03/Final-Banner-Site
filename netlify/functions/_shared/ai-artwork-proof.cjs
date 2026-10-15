'use strict';
const { toStoredOriginalPrintScene } = require('./stored-original-print-scene.cjs');
const { renderPrintSceneToPdfBuffer } = require('./print-scene-renderer.cjs');

async function createAiArtworkProof(item) {
  const filename = item?.artwork_manifest?.originalFilename || item?.original_filename || item?.file_name;
  if (!/^ai-fit-\d+(?:\.\d+)?x\d+(?:\.\d+)?-.+\.(?:jpe?g|png)$/i.test(filename || '')) throw new Error('This item has no saved AI-fitted artwork.');
  const state = typeof item.canvas_state_json === 'string' ? JSON.parse(item.canvas_state_json) : item.canvas_state_json;
  const source = item.artwork_manifest?.originalUrl || item.file_url;
  if (!state || !source || state.originalImageUrl !== source) throw new Error('The saved layout does not match the original artwork. Please review this item.');
  const scene = toStoredOriginalPrintScene(state, Number(item.width_in), Number(item.height_in));
  if (scene?.sceneVersion !== 2 || scene.objects?.length !== 1 || scene.objects[0].source?.originalUrl !== source) throw new Error('The saved AI layout cannot be exported safely.');
  // Exact physical dimensions and original JPEG/PNG pixels. Never substitute
  // a thumbnail, silently enlarge pixels, or reuse legacy cached blank PDFs.
  const result = await renderPrintSceneToPdfBuffer(scene);
  return { ...result, widthIn: Number(item.width_in), heightIn: Number(item.height_in) };
}
module.exports = { createAiArtworkProof };
