'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { createAiArtworkProof } = require('../_shared/ai-artwork-proof.cjs');

test('full-size proof keeps the original pixels, measures actual PPI, and ignores legacy blank PDF caches', async () => {
  const originalFetch = global.fetch;
  const source = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1792065153/uploads/ai-fit-72x36-test.jpg';
  const buffer = await sharp({ create: { width: 2560, height: 1280, channels: 3, background: '#18448d' } }).jpeg().toBuffer();
  let reads = 0;
  global.fetch = async url => { assert.equal(url, source); reads++; return new Response(buffer); };
  try {
    const item = { width_in: 72, height_in: 36, file_name: 'ai-fit-72x36-test.jpg', file_url: source,
      generated_print_pdf_url: 'https://example.test/blank.pdf',
      canvas_state_json: { source: 'google-ads-banner', version: 2, originalImageUrl: source, originalWidth: 21600, originalHeight: 10800, originalFormat: 'jpg', mimeType: 'image/jpeg', imgScale: 1 } };
    const result = await createAiArtworkProof(item);
    const doc = await PDFDocument.load(result.buffer);
    assert.equal(doc.getPageCount(), 1);
    assert.deepEqual(doc.getPage(0).getSize(), { width: 72 * 72, height: 36 * 72 });
    assert.equal(result.metadata.resolution[0].effectivePpi, 2560 / 72);
    assert.equal(result.metadata.resolution[0].status, 'fail');
    assert.equal(reads, 1);
    await assert.rejects(() => createAiArtworkProof({ ...item, file_url: 'https://example.test/thumbnail.jpg' }), /does not match/);
    assert.equal(reads, 1);
  } finally { global.fetch = originalFetch; }
});
