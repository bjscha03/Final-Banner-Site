import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLargeArtworkHandler, CHUNK_BYTES, MAX_BYTES } from '../_shared/large-artwork.mjs';

function fixture() {
  const data = new Map();
  const store = {
    async get(key) { return data.get(key) ?? null; },
    async set(key, value, options = {}) { if (options.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, value); return { modified: true }; },
    async setJSON(key, value, options) { return this.set(key, value, options); },
  };
  const handler = createLargeArtworkHandler(() => store, { cloudName: 'test' });
  const call = (action, body, session, index, token = session?.token) => handler(new Request(
    `https://bannersonthefly.com/.netlify/functions/artwork-original-upload?action=${action}${session ? `&id=${session.id}` : ''}${index == null ? '' : `&index=${index}`}`,
    { method: 'POST', headers: token ? { 'x-artwork-token': token } : {}, body: body instanceof Uint8Array ? body : JSON.stringify(body) },
  ));
  return { call, data };
}

test('50MB original completes with unchanged SHA256 and immutable retryable chunks', async () => {
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
  assert.equal(result.chunkCount, 17);
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
