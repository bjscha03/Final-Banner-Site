import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import handler from '../order-realistic-preview.mjs';
import source from '../_shared/realistic-preview/source.cjs';
import renderer from '../_shared/realistic-preview/render.cjs';
import geometry from '../_shared/realistic-preview/realisticBanner.cjs';
import artifact from '../_shared/preview-artifact.cjs';

const base = { product_type: 'banner', width_in: 72, height_in: 36, material: '13oz', grommets: 'none', rope_feet: 0, pole_pockets: 'none', final_render_url: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/exact-proof.png' };
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function canonicalItem() {
  const placement = { version: 3, uploadStatus: 'uploaded', sourceIdentity: 'art@1', sourceUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/original.png', productType: 'banner', widthIn: 72, heightIn: 36, fitMode: 'fit', positionPct: { x: 13, y: -8 }, scaleX: 1.4, scaleY: 1.2, compositionRevision: 2, previewWidthPx: 1200, previewHeightPx: 600, previewUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/approved-proof.png', previewPublicId: 'approved-proof' };
  placement.compositionSignature = artifact.buildCompositionSignatureFromPreview(placement);
  return { ...base, placement_preview: placement };
}

test('uses the saved exact composition and all selected finishing options', () => {
  const item = { ...canonicalItem(), grommetOption: 'left_side', rope_feet: 6, rope_placement: 'bottom', pole_pockets: 'top-bottom', pole_pocket_size: '3', material: 'mesh' };
  const url = new URL(source.getRealisticPreviewUrl(item));
  assert.equal(url.searchParams.get('url'), item.placement_preview.previewUrl);
  assert.equal(url.searchParams.get('go'), 'left_side');
  assert.equal(url.searchParams.get('m'), 'mesh');
  assert.equal(url.searchParams.get('p'), 'top-bottom');
  assert.equal(url.searchParams.get('ps'), '3');
  assert.equal(url.searchParams.get('rp'), 'bottom');
  assert.equal(url.searchParams.get('r'), '6');
  assert.ok(source.getRealisticPreviewUrl({ ...base, width_in: '72', height_in: '36', material: '13oz_vinyl' }));
});

test('omits unsupported, unfinished and invalid previews without substituting raw artwork', () => {
  for (const item of [
    { ...base, product_type: 'yard_sign' }, { ...base, product_type: 'car_magnet' },
    { ...base, design_service_enabled: true }, { ...base, width_in: 0 },
    { ...base, final_render_url: null, file_url: base.final_render_url, thumbnail_url: base.final_render_url },
    { ...base, placement_preview: { url: base.final_render_url } },
    { ...canonicalItem(), width_in: 96 },
  ]) assert.equal(source.getRealisticPreviewUrl(item), null);
});

test('limits source fetching to permanent raster images in our image account', async () => {
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error('should not fetch'); };
  for (const url of ['http://res.cloudinary.com/dtrxl120u/image/upload/a.png', 'https://127.0.0.1/a.png', 'https://res.cloudinary.com.evil.test/a.png', 'https://res.cloudinary.com/other/image/upload/a.png', 'https://res.cloudinary.com/dtrxl120u/image/fetch/https://private.test/a.png', 'https://res.cloudinary.com/dtrxl120u/image/upload/a.pdf', 'https://res.cloudinary.com/dtrxl120u/image/upload/a.svg']) {
    const requestUrl = new URL(source.getRealisticPreviewUrl(base)); requestUrl.searchParams.set('url', url);
    assert.equal((await handler(new Request(requestUrl))).status, 400);
  }
  assert.equal(fetched, false);
  const invalidSize = new URL(source.getRealisticPreviewUrl(base)); invalidSize.searchParams.set('w', '999999');
  assert.equal((await handler(new Request(invalidSize))).status, 400);
  assert.equal((await handler(new Request(source.getRealisticPreviewUrl(base), { method: 'POST' }))).status, 405);
});

test('returns a real email-safe PNG with bounded fetching and caching', async () => {
  const image = await sharp({ create: { width: 720, height: 360, channels: 3, background: '#18448d' } }).png().toBuffer();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, base.final_render_url.replace('/image/upload/', '/image/upload/c_limit,w_1600,h_1600,f_png/')); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(image, { headers: { 'Content-Type': 'image/png' } });
  };
  const response = await handler(new Request(source.getRealisticPreviewUrl(base)));
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.match(response.headers.get('cache-control'), /max-age=86400/);
  const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(meta.width, 1000); assert.equal(meta.height, 556);
});

test('unavailable or oversized artwork produces a short-lived labeled fallback', async () => {
  for (const response of [new Response('', { status: 404 }), new Response('x', { headers: { 'Content-Type': 'image/png', 'Content-Length': String(15 * 1024 * 1024) } }), new Response('<html/>', { headers: { 'Content-Type': 'text/html' } })]) {
    globalThis.fetch = async () => response;
    const result = await handler(new Request(source.getRealisticPreviewUrl(base)));
    assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'public, max-age=60');
    const meta = await sharp(Buffer.from(await result.arrayBuffer())).metadata();
    assert.equal(meta.width, 600); assert.equal(meta.height, 240);
  }
});

test('preserves artwork edges and proportions for landscape, portrait and oversized banners', async () => {
  // Colored edge markers would disappear if the compositor cover-cropped or
  // reapplied the saved item's scale/position a second time.
  const art = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360"><rect width="720" height="360" fill="#18448d"/><rect width="50" height="360" fill="#10b981"/><rect x="670" width="50" height="360" fill="#e11d48"/></svg>')).png().toBuffer();
  for (const [w, h] of [[72, 36], [36, 72], [240, 120], [600, 60]]) {
    const item = { ...base, width_in: w, height_in: h, image_scale: 4, image_position: { x: 80, y: 30 }, pole_pockets: 'top-bottom' };
    const png = await renderer.renderRealisticPreview(item, art);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const g = geometry.getRealisticBannerGeometry(item);
    const pixel = fx => {
      const x = Math.round((g.x + g.w * fx) / g.sceneWidth * info.width), y = Math.round((g.y + g.h / 2) / g.sceneHeight * info.height);
      return [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    };
    const left = pixel(.035), right = pixel(.965);
    assert.ok(left[1] > left[0] * 2 && left[1] > left[2], `left edge ${w}x${h}: ${left}`);
    assert.ok(right[0] > right[1] * 3 && right[0] > right[2] * 2, `right edge ${w}x${h}: ${right}`);
  }
});

test('mesh exposes the wall while solid vinyl remains opaque', async () => {
  const art = await sharp({ create: { width: 720, height: 360, channels: 3, background: '#0b2340' } }).png().toBuffer();
  const means = [];
  for (const material of ['13oz', 'mesh']) {
    const png = await renderer.renderRealisticPreview({ ...base, material, grommets: '4-corners' }, art);
    const patch = await sharp(png).extract({ left: 300, top: 200, width: 100, height: 100 }).png().toBuffer();
    const stats = await sharp(patch).stats();
    means.push(stats.channels[0].mean);
  }
  assert.ok(means[0] < 15); assert.ok(means[1] > means[0] + 10, JSON.stringify(means));
});
