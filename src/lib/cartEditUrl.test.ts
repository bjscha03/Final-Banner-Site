import { describe, expect, it } from 'vitest';
import { cartEditUrl } from './cartEditUrl';

describe('cart editing destinations', () => {
  it.each(['design', 'google-ads'] as const)('edits double-sided banners inside the existing %s designer', (source) => {
    const url = new URL(cartEditUrl({ id: 'saved & item/1', source, product_type: 'banner', material: '18oz_double' }), 'https://example.com');
    expect(url.pathname).toBe(source === 'google-ads' ? '/google-ads-banner' : '/design');
    expect(url.searchParams.get('sides')).toBe('double');
    expect(url.searchParams.get('editItem')).toBe('saved & item/1');
  });
  it.each([
    ['google-ads', 'banner', '/google-ads-banner', 'banner'],
    ['design', 'banner', '/design', 'banner'],
    ['homepage', undefined, '/design', 'banner'],
    ['design', 'yard_sign', '/design', 'yard-signs'],
    ['google-ads', 'car_magnet', '/google-ads-banner', 'car-magnets'],
  ] as const)('restores %s %s to its own product editor', (source, product_type, route, product) => {
    const url = new URL(cartEditUrl({ id: 'saved & item/1', source, product_type }), 'https://example.com');
    expect(url.pathname).toBe(route);
    expect(url.searchParams.get('product')).toBe(product);
    expect(url.searchParams.get('editItem')).toBe('saved & item/1');
  });
});
