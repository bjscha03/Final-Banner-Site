import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const MAX_BYTES = 50 * 1024 * 1024;
export const CHUNK_BYTES = 3 * 1024 * 1024;
const TTL = 2 * 60 * 60 * 1000;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-f0-9-]{36}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createLargeArtworkHandler(getStore, { cloudName, now = Date.now } = {}) {
  return async function handler(request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const store = getStore();
    if (action === 'start') {
      const input = await request.json();
      const format = String(input.fileName || '').split('.').pop().toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'pdf'].includes(format)) return json({ error: 'Unsupported artwork type' }, 415);
      if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_BYTES) return json({ error: 'Maximum artwork size is 50MB' }, 413);
      const id = randomUUID();
      const token = randomBytes(32).toString('hex');
      const session = { id, tokenHash: digest(token), size: input.size, format, fileName: String(input.fileName).slice(0, 200), createdAt: now() };
      await store.setJSON(`${id}/session`, session);
      return json({ id, token, chunkBytes: CHUNK_BYTES });
    }

    const id = url.searchParams.get('id') || '';
    if (!idPattern.test(id)) return json({ error: 'Invalid upload' }, 400);
    const session = await store.get(`${id}/session`, { type: 'json' });
    const token = request.headers.get('x-artwork-token') || '';
    if (!session || !token || digest(token) !== session.tokenHash) return json({ error: 'Upload not authorized' }, 403);
    if (now() - session.createdAt > TTL) return json({ error: 'Upload session expired. Please retry.' }, 410);
    const complete = await store.get(`${id}/complete`, { type: 'json' });
    if (complete) return action === 'complete' ? json(complete) : json({ error: 'Artwork already finalized' }, 409);

    if (action === 'chunk') {
      const index = Number(url.searchParams.get('index'));
      const count = Math.ceil(session.size / CHUNK_BYTES);
      if (!Number.isSafeInteger(index) || index < 0 || index >= count) return json({ error: 'Invalid chunk' }, 400);
      const expected = Math.min(CHUNK_BYTES, session.size - index * CHUNK_BYTES);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength !== expected) return json({ error: 'Incomplete artwork chunk' }, 400);
      const key = `${id}/chunk-${index}`;
      const result = await store.set(key, bytes.buffer, { onlyIfNew: true });
      if (!result.modified) {
        const existing = await store.get(key, { type: 'arrayBuffer' });
        if (!existing || digest(Buffer.from(existing)) !== digest(bytes)) return json({ error: 'Artwork chunk conflict' }, 409);
      }
      return json({ uploaded: expected, index });
    }

    if (action !== 'complete') return json({ error: 'Invalid action' }, 400);
    const input = await request.json();
    let preview;
    try { preview = new URL(input.previewUrl); } catch { return json({ error: 'Missing permanent preview' }, 400); }
    if (preview.protocol !== 'https:' || preview.hostname !== 'res.cloudinary.com' || !preview.pathname.startsWith(`/${cloudName}/image/upload/`)) {
      return json({ error: 'Invalid artwork preview' }, 400);
    }
    const hash = createHash('sha256');
    const count = Math.ceil(session.size / CHUNK_BYTES);
    for (let index = 0; index < count; index++) {
      const data = await store.get(`${id}/chunk-${index}`, { type: 'arrayBuffer' });
      if (!data || data.byteLength !== Math.min(CHUNK_BYTES, session.size - index * CHUNK_BYTES)) return json({ error: 'Artwork upload is incomplete' }, 409);
      const bytes = Buffer.from(data);
      if (index === 0) {
        const valid = session.format === 'pdf' ? bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
          : session.format === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if (!valid) return json({ error: 'Artwork contents do not match the file type' }, 415);
      }
      hash.update(bytes);
    }
    const originalUrl = `${url.origin}/artwork-original/${id}/original.${session.format}`;
    const result = {
      secureUrl: originalUrl, productionUrl: originalUrl, previewUrl: preview.href,
      publicId: originalUrl, fileKey: originalUrl, bytes: session.size,
      width: Number(input.width) > 0 ? Number(input.width) : null,
      height: Number(input.height) > 0 ? Number(input.height) : null,
      format: session.format, resourceType: 'original',
      mimeType: session.format === 'pdf' ? 'application/pdf' : session.format === 'png' ? 'image/png' : 'image/jpeg',
      originalFilename: session.fileName, sha256: hash.digest('hex'),
      uploadedAt: new Date(now()).toISOString(), chunkCount: count,
    };
    await store.setJSON(`${id}/complete`, result, { onlyIfNew: true });
    return json(result);
  };
}
