import { describe, expect, it } from 'vitest';
import { getDesignerSEO } from '../designerSEO';
import { parseConfiguratorProductQuery } from '../../configurator';
import designerDocument, { config } from '../../../../netlify/edge-functions/designer-document';

describe('public designer SEO routing', () => {
  it.each([
    ['', 'banner'], ['?product=banner&material=mesh', 'banner'],
    ['?product=yard-signs&utm_source=google&width=24', 'yard-signs'],
    ['?product=yard_sign', 'yard-signs'], ['?product=car_magnet&edit=abc', 'car-magnets'],
    ['?product=car-magnets&gclid=tracking', 'car-magnets'],
    ['?product=banner&tab=car-magnets', 'car-magnets'],
  ])('serves matching product HTML without changing incoming URL %s', (query, variant) => {
    const request = new Request(`https://bannersonthefly.com/design${query}`);
    const original = request.url;
    const result = designerDocument(request) as URL;
    expect(result.pathname).toBe(`/seo-documents/design-${variant}.html`);
    expect(request.url).toBe(original);
    expect(result.origin).toBe('https://bannersonthefly.com');
    const params = new URL(original).searchParams;
    const metadata = getDesignerSEO(parseConfiguratorProductQuery(params.get('tab') || params.get('product')));
    expect(metadata.canonical).toBe(`https://bannersonthefly.com/design${variant === 'banner' ? '' : `?product=${variant}`}`);
    expect(metadata.noindex).not.toBe(true);
  });
  it('keeps checkout, upload, payment and unrelated requests outside the edge route', () => {
    expect(config.path).toEqual(['/design', '/design/']);
    expect(designerDocument(new Request('https://bannersonthefly.com/design', { method: 'POST' }))).toBeUndefined();
  });
  it('has distinct, product-specific metadata', () => {
    const entries = ['banner','yard_sign','car_magnet'].map(getDesignerSEO);
    for (const key of ['title','description','canonical','ogImage'] as const) expect(new Set(entries.map(x => x[key])).size).toBe(3);
    expect(entries[1].title).toContain('Yard Sign');
    expect(entries[2].title).toContain('Car Magnet');
  });
});
