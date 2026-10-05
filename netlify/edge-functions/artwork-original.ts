import { getStore } from '@netlify/blobs';

// Stream original chunks without buffering a large original into a Function
// response. Stable URLs retain the original bytes across production deploys.
export default async (request: Request) => {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/artwork-original\/([a-f0-9-]{36})\/original\.(png|jpe?g|pdf)$/);
  if (!match) return new Response(null, { status: 404 });
  const store = getStore({ name: 'artwork-originals-v1', consistency: 'strong' });
  const manifest = await store.get(`${match[1]}/complete`, { type: 'json' });
  if (!manifest || manifest.format !== match[2]) return new Response(null, { status: 404 });
  const headers = {
    'Content-Type': manifest.mimeType,
    'Content-Length': String(manifest.bytes),
    'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(manifest.originalFilename)}`,
    'Cache-Control': 'private, max-age=86400, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Artwork-Sha256': manifest.sha256,
    'ETag': `"${manifest.sha256}"`,
  };
  if (request.method === 'HEAD') return new Response(null, { headers });
  let index = 0;
  let reader: ReadableStreamDefaultReader | null = null;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          if (!reader) {
            if (index >= manifest.chunkCount) { controller.close(); return; }
            const chunk = await store.get(`${match[1]}/chunk-${index++}`, { type: 'stream' });
            if (!chunk) throw new Error('Original artwork chunk is unavailable');
            reader = chunk.getReader();
          }
          const result = await reader.read();
          if (result.done) { reader.releaseLock(); reader = null; continue; }
          controller.enqueue(result.value);
          return;
        }
      } catch (error) { controller.error(error); }
    },
    async cancel() { await reader?.cancel(); },
  });
  return new Response(stream, { headers });
};

export const config = { path: '/artwork-original/*' };
