import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const { getStore } = vi.hoisted(() => ({ getStore: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore }));
import serve from '../../netlify/edge-functions/artwork-original';
afterEach(() => vi.clearAllMocks());
it('streams all 50MB unchanged and supports HEAD and download filenames', async () => {
  const bytes = new Uint8Array(50 * 1024 * 1024).fill(123);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const chunkBytes = 3 * 1024 * 1024;
  getStore.mockReturnValue({ get: async (key: string) => {
    if (key.endsWith('/complete')) return { format: 'png', mimeType: 'image/png', bytes: bytes.length, sha256, chunkCount: 17, originalFilename: 'customer art.png' };
    const index = Number(key.split('chunk-')[1]);
    return new Blob([bytes.slice(index * chunkBytes, (index + 1) * chunkBytes)]).stream();
  } });
  const url = 'https://bannersonthefly.com/artwork-original/12345678-1234-1234-1234-123456789abc/original.png?download=1';
  const response = await serve(new Request(url));
  expect(response.headers.get('Content-Length')).toBe(String(bytes.length));
  expect(response.headers.get('Content-Disposition')).toContain('attachment');
  expect(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex')).toBe(sha256);
  const head = await serve(new Request(url, { method: 'HEAD' }));
  expect(await head.text()).toBe('');
  expect(head.headers.get('X-Artwork-Sha256')).toBe(sha256);
});
