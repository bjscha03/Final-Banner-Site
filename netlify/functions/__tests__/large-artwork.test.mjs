import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLargeArtworkHandler, CHUNK_BYTES, MAX_BYTES } from '../_shared/large-artwork.mjs';

function fixture(options = {}) {
  const data = new Map();
  const store = {
    async get(key) { return data.get(key) ?? null; },
    async set(key, value, options = {}) { if (options.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, value); return { modified: true }; },
    async setJSON(key, value, options) { return this.set(key, value, options); },
  };
  const handler = createLargeArtworkHandler(() => store, { cloudName: 'test', ...options });
  const call = (action, body, session, index, token = session?.token) => handler(new Request(
    `https://bannersonthefly.com/.netlify/functions/artwork-original-upload?action=${action}${session ? `&id=${session.id}` : ''}${index == null ? '' : `&index=${index}`}`,
    { method: 'POST', headers: token ? { 'x-artwork-token': token } : {}, body: body instanceof Uint8Array ? body : JSON.stringify(body) },
  ));
  return { call, data };
}

test('300MB original completes with unchanged SHA256 and immutable retryable chunks', async () => {
  const { call, data } = fixture();
  const bytes = new Uint8Array(MAX_BYTES).fill(87);
  bytes.set([137,80,78,71,13,10,26,10]);
  const session = await (await call('start', { fileName: 'original.png', size: bytes.length })).json();
  assert.equal((await call('complete', { previewUrl: 'https://res.cloudinary.com/test/image/upload/preview.png' }, session)).status, 409);
  assert.equal((await call('chunk', bytes.slice(0, CHUNK_BYTES), session, 0, 'wrong-token')).status, 403);
  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index++) {
    assert.equal((await call('chunk', bytes.slice(offset, offset + CHUNK_BYTES), session, index)).status, 200);
  }
  assert.equal((await call('chunk', bytes.slice(0, CHUNK_BYTES), session, 0)).status, 200);
  const changed = bytes.slice(0, CHUNK_BYTES); changed[100] = 0;
  assert.equal((await call('chunk', changed, session, 0)).status, 409);
  const response = await call('complete', { previewUrl: 'https://res.cloudinary.com/test/image/upload/preview.png', width: 5000, height: 3000 }, session);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.bytes, MAX_BYTES);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.match(result.productionUrl, /artwork-original/);
  assert.equal(result.chunkCount, 100);
  assert.equal((await call('chunk', bytes.slice(0, CHUNK_BYTES), session, 0)).status, 409);
  const stored = Buffer.concat(Array.from({ length: result.chunkCount }, (_, i) => Buffer.from(data.get(`${session.id}/chunk-${i}`))));
  assert.deepEqual(stored, Buffer.from(bytes));
});

test('rejects excess size, corrupt content, partial chunks and external previews', async () => {
  const { call } = fixture();
  assert.equal((await call('start', { fileName: 'a.pdf', size: MAX_BYTES + 1 })).status, 413);
  const session = await (await call('start', { fileName: 'a.pdf', size: 10 })).json();
  assert.equal((await call('chunk', new Uint8Array(9), session, 0)).status, 400);
  assert.equal((await call('chunk', new Uint8Array(10), session, 0)).status, 200);
  assert.equal((await call('complete', { previewUrl: 'https://evil.test/preview' }, session)).status, 400);
  assert.equal((await call('complete', { previewUrl: 'https://res.cloudinary.com/test/image/upload/p.png' }, session)).status, 415);
});

test('raster completion builds the preview from exact stored bytes and ignores a blank client preview', async () => {
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
  let calls = 0;
  const { call, data } = fixture({ createRasterPreview: async (original) => {
    calls++;
    assert.deepEqual(original, Buffer.from(bytes));
    return { previewUrl: 'https://res.cloudinary.com/test/image/upload/server.png', width: 6300, height: 9900 };
  } });
  const session = await (await call('start', { fileName: 'large.png', size: bytes.length })).json();
  await call('chunk', bytes, session, 0);
  const result = await (await call('complete', { previewUrl: '', width: 1, height: 1 }, session)).json();
  assert.equal(result.previewUrl, 'https://res.cloudinary.com/test/image/upload/server.png');
  assert.equal(result.width, 6300);
  assert.equal(result.height, 9900);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(Buffer.from(data.get(`${session.id}/chunk-0`)), Buffer.from(bytes));
  assert.deepEqual(await (await call('complete', {}, session)).json(), result);
  assert.equal(calls, 1);
});

test('failed server preview never finalizes an empty artifact and preserves chunks for retry', async () => {
  let fail = true;
  const { call, data } = fixture({ createRasterPreview: async () => {
    if (fail) throw new Error('Preview upload unavailable');
    return { previewUrl: 'https://res.cloudinary.com/test/image/upload/retry.png', width: 100, height: 200 };
  } });
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10]);
  const session = await (await call('start', { fileName: 'large.png', size: bytes.length })).json();
  await call('chunk', bytes, session, 0);
  await assert.rejects(call('complete', {}, session), /unavailable/);
  assert.equal(data.has(`${session.id}/complete`), false);
  assert.equal(data.has(`${session.id}/chunk-0`), true);
  fail = false;
  assert.equal((await call('complete', {}, session)).status, 200);
});
