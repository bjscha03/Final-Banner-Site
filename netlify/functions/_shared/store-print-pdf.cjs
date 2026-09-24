const { randomUUID, createHash } = require('node:crypto');

async function storePrintPdf(buffer, filename) {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'artwork-originals-v1', consistency: 'strong' });
  const id = randomUUID();
  const chunkBytes = 3 * 1024 * 1024;
  const chunkCount = Math.ceil(buffer.length / chunkBytes);
  for (let index = 0; index < chunkCount; index++) {
    const chunk = buffer.subarray(index * chunkBytes, (index + 1) * chunkBytes);
    await store.set(`${id}/chunk-${index}`, new Uint8Array(chunk).buffer);
  }
  await store.setJSON(`${id}/complete`, {
    format: 'pdf', mimeType: 'application/pdf', bytes: buffer.length,
    originalFilename: filename, chunkCount,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  });
  const origin = process.env.DEPLOY_PRIME_URL || 'https://bannersonthefly.com';
  if (!origin) throw new Error('Print download origin unavailable');
  return `${origin}/artwork-original/${id}/original.pdf`;
}
module.exports = { storePrintPdf };
