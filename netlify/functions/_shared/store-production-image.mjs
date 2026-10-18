import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

// Use the same chunked, streamed storage as large customer originals. This
// avoids Cloudinary's 20 MB raw-file cap and Lambda's binary-response cap.
export async function storeProductionImage(buffer, filename, origin, store = getStore({ name: 'artwork-originals-v1', consistency: 'strong' })) {
  const id = randomUUID();
  const chunkBytes = 3 * 1024 * 1024;
  const chunkCount = Math.ceil(buffer.length / chunkBytes);
  for (let index = 0; index < chunkCount; index++) {
    const chunk = buffer.subarray(index * chunkBytes, (index + 1) * chunkBytes);
    await store.set(`${id}/chunk-${index}`, new Uint8Array(chunk).buffer, { onlyIfNew: true });
  }
  // Publish only after every chunk is stored, so partial files are not served.
  await store.setJSON(`${id}/complete`, {
    format: 'jpg', mimeType: 'image/jpeg', bytes: buffer.length,
    originalFilename: filename, chunkCount,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }, { onlyIfNew: true });
  return new URL(`/artwork-original/${id}/original.jpg`, origin).href;
}
