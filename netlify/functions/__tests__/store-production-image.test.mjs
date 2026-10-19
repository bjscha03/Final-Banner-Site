import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { storeProductionImage } from '../_shared/store-production-image.mjs';
it('stores a 27MB image in chunks and publishes exact bytes only after all chunks succeed', async () => {
  const input = Buffer.alloc(27 * 1024 * 1024 + 7, 123);
  const chunks = []; let manifest;
  const store = { set: async (key, bytes) => chunks.push(Buffer.from(bytes)), setJSON: async (key, value) => { manifest = value; } };
  const url = await storeProductionImage(input, 'banner-200dpi.jpg', 'https://bannersonthefly.com', store);
  expect(url).toMatch(/^https:\/\/bannersonthefly.com\/artwork-original\/[a-f0-9-]+\/original.jpg$/);
  expect(Math.max(...chunks.map(chunk => chunk.length))).toBe(3 * 1024 * 1024);
  expect(Buffer.concat(chunks).equals(input)).toBe(true);
  expect(manifest).toMatchObject({ bytes: input.length, chunkCount: 10, mimeType: 'image/jpeg', sha256: createHash('sha256').update(input).digest('hex') });
});
it('does not publish a partial image when storage fails', async () => {
  let finalized = false;
  await expect(storeProductionImage(Buffer.alloc(4), 'a.jpg', 'https://bannersonthefly.com', {
    set: async () => { throw new Error('connection interrupted'); },
    setJSON: async () => { finalized = true; },
  })).rejects.toThrow('connection interrupted');
  expect(finalized).toBe(false);
});
