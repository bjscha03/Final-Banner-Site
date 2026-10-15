const { isStoredOriginalUrl, isCloudinaryOriginalUrl } = require('./original-artwork-url.cjs');

// Older simple-banner designers save transforms but not sceneVersion. Convert
// only that known, single-image format; previews are never production sources.
function toStoredOriginalPrintScene(state, widthIn, heightIn) {
  if (!state || state.sceneVersion === 2 || state.version !== 2
    || !['google-ads-banner', 'design-page'].includes(state.source)
    || !(isStoredOriginalUrl(state.originalImageUrl) || isCloudinaryOriginalUrl(state.originalImageUrl))) return state;
  const sourceWidth = Number(state.originalWidth);
  const sourceHeight = Number(state.originalHeight);
  const width = Number(widthIn);
  const height = Number(heightIn);
  const scaleX = Number(state.imgScale ?? 1);
  const scaleY = Number(state.imgScaleY ?? state.imgScale ?? 1);
  const xPct = Number(state.imgPos?.x ?? 0);
  const yPct = Number(state.imgPos?.y ?? 0);
  if (![sourceWidth, sourceHeight, width, height, scaleX, scaleY].every(n => Number.isFinite(n) && n > 0)
    || ![xPct, yPct].every(Number.isFinite)) {
    throw new Error('Saved original artwork placement is incomplete; production PDF cannot be rendered.');
  }
  const containScale = Math.min(width / sourceWidth, height / sourceHeight);
  const placedWidth = sourceWidth * containScale * scaleX;
  const placedHeight = sourceHeight * containScale * scaleY;
  const crop = state.canonicalComposition?.transform?.crop || state.crop;
  return {
    sceneVersion: 2, widthIn: width, heightIn: height,
    backgroundColor: state.bgColor || '#ffffff',
    objects: [{
      id: 'stored-original', type: 'image',
      xIn: (width - placedWidth) / 2 + xPct * width / 100,
      yIn: (height - placedHeight) / 2 + yPct * height / 100,
      widthIn: placedWidth, heightIn: placedHeight, rotation: 0,
      ...(crop ? { crop } : {}),
      source: {
        originalUrl: state.originalImageUrl,
        resourceType: isStoredOriginalUrl(state.originalImageUrl) ? 'original' : 'image', format: state.originalFormat,
        mimeType: state.mimeType, originalWidth: sourceWidth,
        originalHeight: sourceHeight,
      },
    }],
  };
}

module.exports = { toStoredOriginalPrintScene };
