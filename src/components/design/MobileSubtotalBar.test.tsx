import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MobileSubtotalBar from './MobileSubtotalBar';

describe('MobileSubtotalBar', () => {
  it('renders the shared subtotal and cart-only mobile action', () => {
    const html = renderToStaticMarkup(
      <MobileSubtotalBar
        subtotal={<p>$36.00</p>}
        cartItemCount={0}
        onViewCart={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="mobile-subtotal-bar"');
    expect(html).toContain('Subtotal');
    expect(html).toContain('$36.00');
    expect(html).toContain('View Cart (0)');
    expect(html).not.toContain('Upload Artwork');
    expect(html).not.toContain('data-mobile-guided-action');
    expect(html).toContain('env(safe-area-inset-bottom, 0.75rem)');
  });
});
