import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/cart', () => ({ useCartStore: () => ({ getItemCount: () => 1 }) }));
vi.mock('@/store/ui', () => ({ useUIStore: () => ({ isCartOpen: false, setIsCartOpen: vi.fn() }) }));
vi.mock('./Header', () => ({ default: ({ checkoutMode }: { checkoutMode?: boolean }) => <nav data-checkout-mode={checkoutMode ? 'true' : 'false'}>Store navigation</nav> }));
vi.mock('./Footer', () => ({ default: () => <footer>Store footer</footer> }));
vi.mock('./CartModal', () => ({ default: () => null }));
vi.mock('./ScrollToTop', () => ({ default: () => null }));
import Layout from './Layout';

describe('checkout navigation', () => {
  it.each([undefined, true])('keeps navigation and passes checkout mode during all checkout states (mode %s)', (checkoutMode) => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/checkout']}><Layout checkoutMode={checkoutMode}>Checkout content</Layout></MemoryRouter>);
    expect(html).toContain('Secure encrypted checkout');
    expect(html).toContain('data-checkout-mode="true"');
    expect(html).toContain('Store navigation');
    expect(html).not.toContain('Store footer');
    expect(html).toContain('Checkout help');
  });

  it('keeps the store navigation on other pages', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/design']}><Layout>Designer</Layout></MemoryRouter>);
    expect(html).toContain('Store navigation');
    expect(html).toContain('Store footer');
  });
});
