// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import MobileSubtotalBar from './MobileSubtotalBar';

it('offers the current banner action with an empty cart and blocks repeat taps while saving', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const upload = vi.fn();
  const checkout = vi.fn();
  const viewCart = vi.fn();
  const render = (label: string, onClick: () => void, disabled = false) => act(() => root.render(
    <MobileSubtotalBar
      subtotal={<p>$72.00</p>}
      cartItemCount={0}
      onViewCart={viewCart}
      primaryAction={{ label, onClick, disabled }}
    />,
  ));
  const button = () => container.querySelector('button')!;
  try {
    render('Upload artwork', upload);
    expect(container.textContent).not.toContain('View Cart (0)');
    act(() => button().click());
    expect(upload).toHaveBeenCalledOnce();

    render('Continue to checkout', checkout);
    expect(button().textContent).toBe('Continue to checkout');
    act(() => button().click());
    expect(checkout).toHaveBeenCalledOnce();
    expect(viewCart).not.toHaveBeenCalled();

    render('Saving your design…', checkout, true);
    act(() => button().click());
    expect(button().disabled).toBe(true);
    expect(checkout).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
