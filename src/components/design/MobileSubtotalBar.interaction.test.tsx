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
  const button = () => container.querySelector<HTMLButtonElement>('[data-banner-primary-action]')!;
  try {
    render('Upload artwork', upload);
    expect(container.textContent).toContain('View cart (0)');
    act(() => container.querySelector<HTMLButtonElement>('button:not([data-banner-primary-action])')!.click());
    expect(viewCart).toHaveBeenCalledOnce();
    act(() => button().click());
    expect(upload).toHaveBeenCalledOnce();

    render('Next: Finishing', checkout);
    expect(button().textContent).toBe('Next: Finishing');
    act(() => button().click());
    expect(checkout).toHaveBeenCalledOnce();
    expect(viewCart).toHaveBeenCalledOnce();

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

it('keeps the paid mobile size and price beside one action and preserves upload cancellation', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const next = vi.fn();
  const cancel = vi.fn();
  const render = (busy = false) => act(() => root.render(<MobileSubtotalBar compact
    selectionLabel="6′ × 3′ · banner" subtotal={<span>$72.00</span>} cartItemCount={0} onViewCart={vi.fn()}
    primaryAction={{ label: busy ? 'Uploading…' : 'Add artwork', onClick: next, disabled: busy }}
    uploadRecovery={busy ? { onCancel: cancel } : undefined} />));
  try {
    render();
    expect(container.textContent).toContain('6′ × 3′ · banner');
    expect(container.textContent).toContain('$72.00');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    act(() => container.querySelector<HTMLButtonElement>('[data-banner-primary-action]')!.click());
    expect(next).toHaveBeenCalledOnce();
    render(true);
    act(() => container.querySelector<HTMLButtonElement>('[data-banner-primary-action]')!.click());
    expect(next).toHaveBeenCalledOnce();
    act(() => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Cancel upload')!.click());
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
