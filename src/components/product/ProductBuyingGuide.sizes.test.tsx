// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import ProductBuyingGuide from './ProductBuyingGuide';
import { PRODUCT_LANDING_DATA } from '@/lib/seo/productLandingData';

it('opens each horizontal banner example with matching width and height', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<MemoryRouter initialEntries={['/vinyl-banners']}><ProductBuyingGuide product={PRODUCT_LANDING_DATA['vinyl-banners']} includeFaq={false} /></MemoryRouter>);
  const cards = Array.from(host.querySelectorAll('[data-size-snapshot]'));
  expect(cards).toHaveLength(3);
  for (const [index, [width, height]] of [[48, 24], [72, 36], [96, 48]].entries()) {
    const card = cards[index];
    const url = new URL(card.closest('a')!.getAttribute('href')!, 'https://bannersonthefly.com');
    expect(card.textContent).toContain(`${width / 12} ft wide × ${height / 12} ft high`);
    expect(url.searchParams.get('width')).toBe(String(width));
    expect(url.searchParams.get('height')).toBe(String(height));
  }
});
