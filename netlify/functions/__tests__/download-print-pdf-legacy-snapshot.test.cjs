const assert = require('node:assert/strict');

const { _test } = require('../download-print-pdf.cjs');

const legacyState = {
  source: 'design-page',
  version: 2,
  widthIn: 96,
  heightIn: 48,
  originalImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/uploads/original.png',
  originalImageFileKey: 'uploads/original',
  originalFormat: 'png',
  imgScale: 1.75,
  imgPos: { x: 18, y: -7 },
};

const simpleLegacy = _test.prepareItemRequest(
  { orderId: 'old-order' },
  {
    id: 'old-item',
    width_in: 96,
    height_in: 48,
    file_key: 'uploads/original',
    file_url: legacyState.originalImageUrl,
    final_render_url: 'https://res.cloudinary.com/demo/image/upload/v1/order-prints/approved.jpg',
    thumbnail_url: 'https://res.cloudinary.com/demo/image/upload/v1/order-prints/thumb.jpg',
    canvas_state_json: JSON.stringify(legacyState),
    image_scale: 1.75,
    image_position: { x: 18, y: -7 },
    text_elements: [],
    overlay_image: null,
    overlay_images: [],
  },
);

assert.equal(simpleLegacy.source, 'legacy-original-contain');
assert.equal(simpleLegacy.normalizedScene, null);
assert.equal(simpleLegacy.req.canvasStateJson, null);
assert.equal(simpleLegacy.req.finalRenderUrl, null);
assert.equal(simpleLegacy.originalAsset.url, legacyState.originalImageUrl);
assert.equal(simpleLegacy.originalAsset.format, 'png');
assert.equal(simpleLegacy.originalAsset.isPdf, false);

const composedLegacy = _test.prepareItemRequest(
  { orderId: 'old-composed-order' },
  {
    id: 'old-composed-item',
    width_in: 96,
    height_in: 48,
    file_key: 'uploads/original',
    file_url: legacyState.originalImageUrl,
    final_render_url: 'https://res.cloudinary.com/demo/image/upload/v1/order-prints/approved.jpg',
    thumbnail_url: 'https://res.cloudinary.com/demo/image/upload/v1/order-prints/thumb.jpg',
    canvas_state_json: JSON.stringify(legacyState),
    text_elements: [{ content: 'Added text' }],
  },
);

assert.equal(composedLegacy.source, 'legacy-approved-snapshot');
assert.equal(composedLegacy.normalizedScene, null);
assert.equal(composedLegacy.req.canvasStateJson, null);
assert.equal(
  composedLegacy.req.finalRenderUrl,
  'https://res.cloudinary.com/demo/image/upload/v1/order-prints/approved.jpg',
);
assert.deepEqual(composedLegacy.req.imagePosition, { x: 0, y: 0 });
assert.equal(composedLegacy.req.imageScale, 1);

const legacyPdfAsset = _test.getLegacyOriginalAsset(
  {
    file_key: 'uploads/original-pdf',
    file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/original.pdf',
  },
  {},
  { isPdf: true, mimeType: 'application/pdf', originalFormat: 'pdf' },
);
assert.equal(legacyPdfAsset.isPdf, true);
assert.equal(legacyPdfAsset.format, 'pdf');

const nativeScene = {
  sceneVersion: 2,
  widthIn: 96,
  heightIn: 48,
  backgroundColor: '#ffffff',
  objects: [],
};

const nativeResult = _test.prepareItemRequest(
  { orderId: 'new-order' },
  {
    id: 'new-item',
    width_in: 96,
    height_in: 48,
    final_render_url: 'https://res.cloudinary.com/demo/image/upload/v1/order-prints/new.jpg',
    canvas_state_json: JSON.stringify(nativeScene),
  },
);

assert.equal(nativeResult.source, 'native-scene-v2');
assert.deepEqual(nativeResult.normalizedScene, nativeScene);
assert.deepEqual(JSON.parse(nativeResult.req.canvasStateJson), nativeScene);

assert.equal(
  _test.getLegacyApprovedSnapshot({
    final_render_url: 'https://res.cloudinary.com/demo/raw/upload/v1/order-prints/source.pdf',
    thumbnail_url: 'https://res.cloudinary.com/demo/image/upload/v1/order-prints/thumb.jpg',
  }),
  'https://res.cloudinary.com/demo/image/upload/v1/order-prints/thumb.jpg',
);

assert.equal(_test.looksLikePng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), true);
assert.equal(_test.looksLikePdf(Buffer.from('%PDF-1.7')), true);

console.log('download-print-pdf legacy quality tests passed');
