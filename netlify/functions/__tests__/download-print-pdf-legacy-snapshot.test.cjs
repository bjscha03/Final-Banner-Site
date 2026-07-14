const assert = require('node:assert/strict');

const { _test } = require('../download-print-pdf.cjs');

assert.equal(
  _test.isUsableApprovedSnapshotUrl('https://cdn.example.com/proof.jpg'),
  true,
);
assert.equal(
  _test.isUsableApprovedSnapshotUrl('blob:https://example.com/temporary'),
  false,
);
assert.equal(
  _test.isUsableApprovedSnapshotUrl('https://cdn.example.com/original.pdf'),
  false,
);

const candidates = _test.getApprovedSnapshotCandidates({
  final_render_url: 'https://cdn.example.com/proof.jpg',
  web_preview_url: 'https://cdn.example.com/proof.jpg',
  thumbnail_url: 'https://cdn.example.com/thumb.png',
});
assert.deepEqual(candidates, [
  { source: 'final_render', url: 'https://cdn.example.com/proof.jpg' },
  { source: 'thumbnail', url: 'https://cdn.example.com/thumb.png' },
]);

const bannerAspect = 2;
const lowerResolution = {
  area: 1200 * 600,
  aspectError: _test.relativeAspectError(1200, 600, bannerAspect),
};
const higherResolution = {
  area: 6000 * 3000,
  aspectError: _test.relativeAspectError(6000, 3000, bannerAspect),
};
const wrongAspect = {
  area: 8000 * 8000,
  aspectError: _test.relativeAspectError(8000, 8000, bannerAspect),
};

assert.equal(_test.isBetterSnapshot(higherResolution, lowerResolution), true);
assert.equal(_test.isBetterSnapshot(wrongAspect, higherResolution), false);

assert.equal(
  _test.looksLikeJpeg(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
  true,
);
assert.equal(
  _test.looksLikePng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00])),
  true,
);

console.log('download-print-pdf approved snapshot tests passed');
