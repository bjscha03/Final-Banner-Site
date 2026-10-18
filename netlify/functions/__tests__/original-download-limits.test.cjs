const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let authorized = true;
Module._load = function(name, parent, ...rest) {
  if (name === '@neondatabase/serverless') return { neon: () => async () => authorized ? [{ artwork_manifest: {} }] : [] };
  if (name === '../server-auth.cjs') return { requireAdmin: () => ({ ok: true }) };
  if (name === 'cloudinary') return { v2: { config() {} } };
  return originalLoad.call(this, name, parent, ...rest);
};
process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/db';
process.env.CLOUDINARY_CLOUD_NAME = 'test'; process.env.CLOUDINARY_API_KEY = 'key'; process.env.CLOUDINARY_API_SECRET = 'secret';
const { handler } = require('../_shared/legacy/download-file.cjs');
Module._load = originalLoad;
test('authorized CDN original downloads bypass binary response limits; unauthorized ones do not redirect', async () => {
  const url = 'https://res.cloudinary.com/test/image/upload/v1/uploads/large-original.png';
  const event = { httpMethod:'GET', queryStringParameters:{ key:url, order:'order-id' } };
  const response = await handler(event);
  assert.equal(response.statusCode,302); assert.equal(response.headers.Location,url); assert.equal(response.body,'');
  authorized = false;
  assert.equal((await handler(event)).statusCode,404);
});
