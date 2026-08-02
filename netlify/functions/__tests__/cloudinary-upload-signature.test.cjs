const test = require('node:test');
const assert = require('node:assert/strict');
const moduleUnderTest = require('../_shared/legacy/cloudinary-upload-signature.cjs');

const originalEnv = {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER,
};

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

function configure() {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'public-api-key';
  process.env.CLOUDINARY_API_SECRET = 'merchant-secret-never-returned';
  process.env.CLOUDINARY_FOLDER = 'uploads';
}

test('returns a signed direct-upload ticket without exposing the API secret', async () => {
  configure();
  const response = await moduleUnderTest.handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      fileName: 'customer-banner.png',
      mimeType: 'image/png',
      size: 8 * 1024 * 1024,
    }),
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.cloudName, 'test-cloud');
  assert.equal(payload.apiKey, 'public-api-key');
  assert.equal(payload.folder, 'uploads');
  assert.equal(payload.resourceType, 'image');
  assert.equal(payload.uploadUrl, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
  assert.equal(typeof payload.signature, 'string');
  assert.ok(payload.signature.length >= 20);
  assert.equal(payload.useFilename, true);
  assert.equal(payload.uniqueFilename, true);
  assert.equal(JSON.stringify(payload).includes('merchant-secret-never-returned'), false);
});

test('accepts PDF metadata while keeping the upload resource type image', async () => {
  configure();
  const response = await moduleUnderTest.handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      fileName: 'print-artwork.pdf',
      mimeType: 'application/pdf',
      size: 20 * 1024 * 1024,
    }),
  });
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.resourceType, 'image');
  assert.match(payload.uploadUrl, /\/image\/upload$/);
});

test('rejects files larger than the advertised 50MB limit', async () => {
  configure();
  const response = await moduleUnderTest.handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      fileName: 'too-large.png',
      mimeType: 'image/png',
      size: moduleUnderTest._test.MAX_BYTES + 1,
    }),
  });
  assert.equal(response.statusCode, 413);
});

test('rejects unsupported file types', async () => {
  configure();
  const response = await moduleUnderTest.handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      fileName: 'malware.exe',
      mimeType: 'application/octet-stream',
      size: 1024,
    }),
  });
  assert.equal(response.statusCode, 415);
});
