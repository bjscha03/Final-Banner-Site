const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toStoredOriginalPrintScene } = require('../_shared/stored-original-print-scene.cjs');
const state = {
  source: 'google-ads-banner', version: 2,
  originalImageUrl: 'https://bannersonthefly.com/artwork-original/77490308-c694-4fe6-b36c-c264281b1e5d/original.png',
  originalWidth: 6300, originalHeight: 9900,
  originalFormat: 'png', mimeType: 'image/png', imgScale: 1, imgPos: { x: 0, y: 0 },
  previewUrl: 'https://res.cloudinary.com/test/image/upload/blank.png',
};

test('simple banner PDF embeds the original at 300ppi, never the blank browser preview', () => {
  const result = toStoredOriginalPrintScene(state, 21, 33);
  assert.equal(result.sceneVersion, 2);
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].source.originalUrl, state.originalImageUrl);
  assert.equal(result.objects[0].widthIn, 21);
  assert.equal(result.objects[0].heightIn, 33);
  assert.equal(result.objects[0].xIn, 0);
  assert.equal(result.objects[0].yIn, 0);
  assert.ok(!JSON.stringify(result).includes('blank.png'));
});

test('preserves saved crop, scale and position in physical units', () => {
  const result = toStoredOriginalPrintScene({ ...state, imgScale: 2, imgScaleY: 1, imgPos: { x: 10, y: -20 } }, 21, 33);
  assert.equal(result.objects[0].widthIn, 42);
  assert.equal(result.objects[0].heightIn, 33);
  assert.equal(result.objects[0].xIn, -8.4);
  assert.equal(result.objects[0].yIn, -6.6);
});

test('retains the source-relative crop without changing original dimensions or URL', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.7 };
  const result = toStoredOriginalPrintScene({ ...state, canonicalComposition: { transform: { crop } } }, 21, 33);
  assert.deepEqual(result.objects[0].crop, crop);
  assert.equal(result.objects[0].source.originalWidth, 6300);
  assert.equal(result.objects[0].source.originalUrl, state.originalImageUrl);
});

test('does not invent placement for incomplete or unrelated design formats', () => {
  assert.throws(() => toStoredOriginalPrintScene({ ...state, originalWidth: null }, 21, 33), /incomplete/);
  const editor = { ...state, source: 'banner-editor' };
  assert.equal(toStoredOriginalPrintScene(editor, 21, 33), editor);
});

test('AI-fitted Cloudinary originals take the full-size source path instead of blank legacy reconstruction', () => {
  const url = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1792065153/uploads/ai-fit-72x36-saved.jpg';
  const result = toStoredOriginalPrintScene({ ...state, originalImageUrl: url, originalWidth: 2560, originalHeight: 1280, originalFormat: 'jpg', mimeType: 'image/jpeg' }, 72, 36);
  assert.equal(result.sceneVersion, 2);
  assert.equal(result.widthIn, 72);
  assert.equal(result.heightIn, 36);
  assert.equal(result.objects[0].source.originalUrl, url);
  assert.equal(result.objects[0].source.originalWidth / result.objects[0].widthIn, 2560 / 72);
  for (const invalid of [url.replace('/v1792065153/', '/w_1080/'), url.replace('dtrxl120u', 'another-cloud'), url.replace('res.cloudinary.com', 'attacker.test')]) {
    const untrusted = { ...state, originalImageUrl: invalid };
    assert.equal(toStoredOriginalPrintScene(untrusted, 72, 36), untrusted);
  }
});
