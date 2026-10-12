const permanentUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());
const permanentKey = (value) => typeof value === 'string' && Boolean(value.trim())
  && !/^(blob:|data:)/i.test(value.trim());
const sourceReady = (value) => permanentUrl(value?.originalUrl || value?.productionUrl || value?.url)
  || permanentKey(value?.publicId || value?.productionPublicId || value?.fileKey);

function hasProductionArtwork(item = {}) {
  if (item.design_service_enabled === true || item.design_service_enabled === 'true') return true;
  if (sourceReady(item.artwork_manifest || {}) || permanentKey(item.file_key)
    || permanentUrl(item.file_url) || permanentUrl(item.print_ready_url)
    || permanentUrl(item.final_render_url) || permanentKey(item.final_render_file_key)
    || permanentUrl(item.final_print_pdf_url)) return true;
  if (Array.isArray(item.text_elements) && item.text_elements.some(text => String(text?.content || text?.text || '').trim())) return true;
  if (sourceReady(item.overlay_image || {}) || (Array.isArray(item.overlay_images) && item.overlay_images.some(sourceReady))) return true;
  if (Array.isArray(item.yard_sign_designs) && item.yard_sign_designs.length) {
    return item.yard_sign_designs.every(design => sourceReady(design)
      || sourceReady(design?.artworkManifest || {}));
  }
  try {
    const scene = typeof item.canvas_state_json === 'string' ? JSON.parse(item.canvas_state_json) : item.canvas_state_json;
    if (scene && (permanentUrl(scene.originalImageUrl || scene.productionUrl)
      || permanentKey(scene.originalImageFileKey || scene.productionPublicId))) return true;
    return Boolean(scene?.objects?.some(object => object?.visible !== false && (
      (object.type === 'image' && sourceReady(object.source || {}))
      || (object.type === 'text' && String(object.text?.content || '').trim())
    )));
  } catch { return false; }
}

function assertOrderArtworkReady(item, index = 0) {
  if (hasProductionArtwork(item)) return;
  const error = new Error(`Item ${index + 1} is missing its saved artwork. Please upload the artwork again before paying.`);
  error.code = 'ORDER_ARTWORK_REQUIRED';
  error.statusCode = 409;
  error.details = { itemIndex: index };
  throw error;
}

module.exports = { hasProductionArtwork, assertOrderArtworkReady };
