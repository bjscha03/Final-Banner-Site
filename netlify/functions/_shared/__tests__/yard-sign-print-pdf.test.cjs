const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../yard-sign-print-pdf.cjs');

test('yard sign print target is 24x18 at 150 DPI', () => {
  assert.deepEqual(_test.getTargetDimensions(24, 18, 150), {
    widthIn: 24,
    heightIn: 18,
    dpi: 150,
    widthPx: 3600,
    heightPx: 2700,
  });
});

test('Cloudinary PDF original is converted to a high-resolution first-page image', () => {
  const result = _test.buildHighResolutionSourceUrl(
    'https://res.cloudinary.com/demo/image/upload/v123/uploads/sign.pdf',
    4320,
  );
  assert.equal(
    result,
    'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_100,w_4320,c_limit/v123/uploads/sign.jpg',
  );
});

test('placement scales browser pixel offsets proportionally to print resolution', () => {
  const placement = _test.computePlacement({
    sourceWidth: 2000,
    sourceHeight: 1000,
    targetWidth: 3600,
    targetHeight: 2700,
    referenceWidth: 500,
    referenceHeight: 375,
    scaleX: 1,
    scaleY: 1,
    offsetX: 50,
    offsetY: 0,
  });

  // A 2:1 source is contained at 3600x1800. The browser offset is 10% of
  // the reference width, so it becomes 360 pixels at print resolution.
  assert.equal(placement.displayWidth, 3600);
  assert.equal(placement.displayHeight, 1800);
  assert.equal(placement.left, 360);
  assert.equal(placement.top, 450);
});

test('yard sign design JSON is parsed without losing multiple designs', () => {
  const designs = _test.parseDesigns(JSON.stringify([
    { id: 'one', fileUrl: 'https://res.cloudinary.com/demo/image/upload/one.png' },
    { id: 'two', fileUrl: 'https://res.cloudinary.com/demo/image/upload/two.png' },
  ]));
  assert.equal(designs.length, 2);
  assert.equal(designs[1].id, 'two');
});
