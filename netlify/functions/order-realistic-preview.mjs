import 'sharp'; // Explicit native dependency for Netlify packaging.
import source from './_shared/realistic-preview/source.cjs';
import geometry from './_shared/realistic-preview/realisticBanner.cjs';
import renderer from './_shared/realistic-preview/render.cjs';

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export default async function handler(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const params = new URL(request.url).searchParams;
  const url = params.get('url');
  const item = {
    product_type: 'banner', width_in: Number(params.get('w')), height_in: Number(params.get('h')),
    material: params.get('m'), grommets: params.get('g'), grommetOption: params.get('go'),
    pole_pockets: params.get('p'), pole_pocket_size: params.get('ps'),
    rope_feet: Number(params.get('r')), rope_placement: params.get('rp'),
    canvas_background_color: params.get('bg'),
  };
  if (!source.isAllowedSource(url) || !geometry.isRealisticBannerItem(item)
      || item.width_in < 1 || item.height_in < 1 || item.width_in > 2400 || item.height_in > 2400) {
    return new Response('Invalid preview', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  let png, cache = 'public, max-age=86400';
  try {
    const boundedSource = url.replace('/image/upload/', '/image/upload/c_limit,w_1600,h_1600,f_png/');
    const response = await fetch(boundedSource, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok || !/^image\/(png|jpeg|webp|avif|gif)(;|$)/i.test(response.headers.get('content-type') || '')
        || Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES || !response.body) throw new Error('SOURCE_UNAVAILABLE');
    const reader = response.body.getReader();
    const chunks = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_SOURCE_BYTES) throw new Error('SOURCE_TOO_LARGE');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    png = await renderer.renderRealisticPreview(item, Buffer.concat(chunks));
  } catch {
    // No artwork URLs/customer data in public logs, and no redirect to an
    // unrelated original. The print-layout thumbnail remains in the email.
    console.warn('[order-realistic-preview] Preview temporarily unavailable');
    png = await renderer.unavailablePreview();
    cache = 'public, max-age=60';
  }
  return new Response(request.method === 'HEAD' ? null : png, { headers: {
    'Content-Type': 'image/png', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff',
  } });
}
