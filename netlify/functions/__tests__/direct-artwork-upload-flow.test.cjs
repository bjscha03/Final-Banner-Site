const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('customer design pages upload original bytes directly instead of through Netlify', () => {
  for (const file of ['src/pages/Design.tsx', 'src/pages/GoogleAdsBanner.tsx']) {
    const source = read(file);
    assert.match(source, /uploadArtworkFile/);
    assert.match(source, /ensurePermanentArtworkUploaded/);
    assert.match(source, /Retrying artwork upload/);
    assert.match(source, /activeUploadPromiseRef/);
    assert.equal(source.includes("fetch('/.netlify/functions/upload-file'"), false);
    assert.equal(source.includes('Upload still processing'), false);
    assert.equal(source.includes('compressImage'), false);
  }
});

test('Yard Sign originals and finalized snapshots use the same direct transport', () => {
  const yardSign = read('src/components/design/YardSignConfigurator.tsx');
  const canvasUpload = read('src/utils/uploadCanvasImage.ts');

  assert.match(yardSign, /uploadArtworkFile/);
  assert.match(yardSign, /StablePreviewImage/);
  assert.equal(yardSign.includes("fetch('/.netlify/functions/upload-file'"), false);
  assert.equal(yardSign.includes('compressImage'), false);
  assert.match(canvasUpload, /uploadArtworkFile/);
  assert.equal(canvasUpload.includes("fetchWithTimeout('/.netlify/functions/upload-file'"), false);
});

test('signed ticket endpoint never returns the Cloudinary API secret', () => {
  const signature = read('netlify/functions/_shared/legacy/cloudinary-upload-signature.cjs');
  assert.match(signature, /api_sign_request/);
  assert.match(signature, /CLOUDINARY_API_SECRET/);
  assert.match(signature, /\/image\/upload/);
  assert.doesNotMatch(signature, /apiSecret[,}]/);
});

test('the original artwork is not recompressed before persistent upload', () => {
  const direct = read('src/utils/uploadArtworkFile.ts');
  assert.match(direct, /formData\.append\('file', file, file\.name\)/);
  assert.equal(direct.includes('canvas.toBlob'), false);
  assert.equal(direct.includes('image/jpeg\', 0.85'), false);
});
