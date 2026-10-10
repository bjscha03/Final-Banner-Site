import test from 'node:test';
import assert from 'node:assert/strict';
import redirect from '../redirect-double-sided-banner.mjs';

test('old banner links permanently redirect to the unified double-sided designer', async () => {
  const response = await redirect(new Request('https://bannersonthefly.com/double-sided-banners'));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), '/design?product=banner&sides=double');
});

test('redirect preserves encoded cart IDs, dimensions and every tracking parameter', async () => {
  const query = new URLSearchParams({ editItem: 'saved & item/1', width: '75', height: '42', utm_source: 'email', gclid: 'click-123' });
  const response = await redirect(new Request(`https://bannersonthefly.com/double-sided-banners?${query}`));
  const destination = new URL(response.headers.get('location'), 'https://bannersonthefly.com');
  assert.equal(destination.pathname, '/design');
  for (const [key, value] of query) assert.equal(destination.searchParams.get(key), value);
  assert.equal(destination.searchParams.get('sides'), 'double');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('legacy product selectors cannot send double-sided customers to a different product', async () => {
  const response = await redirect(new Request('https://bannersonthefly.com/double-sided-banners?tab=yard-signs&product=car-magnets&sides=single'));
  const destination = new URL(response.headers.get('location'), 'https://bannersonthefly.com');
  assert.equal(destination.searchParams.has('tab'), false);
  assert.equal(destination.searchParams.get('product'), 'banner');
  assert.equal(destination.searchParams.get('sides'), 'double');
});
