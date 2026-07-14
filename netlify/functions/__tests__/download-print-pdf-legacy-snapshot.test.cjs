const assert = require('node:assert/strict');

const { _test } = require('../download-print-pdf.cjs');

const legacyState = {
  source: 'design-page',
  version: 2,
  widthIn: 96,
  heightIn: 48,
  originalImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/uploads/original.png',
  originalImageFileKey: 'uploads/original',
  imgScale: 1.75,
  imgPos: { x: 18, y: -7 },
};

const legacyWithApprovedSnapshot = _test.prepareItemRequest(
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
  },
);

assert.equal(legacyWithApprovedSnapshot.source, 'legacy-approved-snapshot');
assert.equal(legacyWithApprovedSnapshot.normalizedScene, null);
assert.equal(legacyWithApprovedSnapshot.req.canvasStateJson, null);
assert.equal(
  legacyWithApprovedSnapshot.req.finalRenderUrl,
  'https://res.cloudinary.com/demo/image/upload/v1/order-prints/approved.jpg',
);
assert.deepEqual(legacyWithApprovedSnapshot.req.imagePosition, { x: 0, y: 0 });
assert.equal(legacyWithApprovedSnapshot.req.imageScale, 1);

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

console.log('download-print-pdf legacy snapshot tests passed');
