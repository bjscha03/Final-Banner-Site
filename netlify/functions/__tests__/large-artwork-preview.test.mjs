import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderLargeArtworkPreview } from '../_shared/large-artwork-preview.mjs';

test('62-megapixel artwork becomes a visible bounded preview with original dimensions', async () => {
  const original = await sharp({ create: { width: 6300, height: 9900, channels: 3, background: '#b31954' } }).png().toBuffer();
  const rendered = await renderLargeArtworkPreview(original);
  assert.equal(rendered.width, 6300);
  assert.equal(rendered.height, 9900);
  const meta = await sharp(rendered.data).metadata();
  assert.equal(meta.height, 1800);
  assert.equal(meta.width, 1145);
  const { data } = await sharp(rendered.data).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [179, 25, 84]);
});

test('a fully transparent derivative is rejected, while opaque white artwork is accepted', async () => {
  const transparent = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#00000000' } }).png().toBuffer();
  await assert.rejects(renderLargeArtworkPreview(transparent), /no visible pixels/);
  const white = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#ffffffff' } }).png().toBuffer();
  assert.equal((await renderLargeArtworkPreview(white)).width, 20);
});
