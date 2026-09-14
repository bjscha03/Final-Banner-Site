// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import CheckoutReviewDialog from './CheckoutReviewDialog';
import CheckoutOrderTotals from './CheckoutOrderTotals';

it('reviews the same totals in a modal and returns to checkout without replacing entered details', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const scrollIntoView = vi.fn();
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  try {
    await act(async () => root.render(<><input aria-label="Checkout email" defaultValue="customer@example.com" /><CheckoutReviewDialog><div>Custom Banner 72 × 36</div><CheckoutOrderTotals subtotalCents={8100} discountAmountCents={1620} shippingLabel="Shipping" taxCents={389} totalCents={6869} /></CheckoutReviewDialog></>));
    const input = host.querySelector('input')!;
    const trigger = host.querySelector('button')!;
    expect(host.textContent).not.toContain('Custom Banner 72 × 36');
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Review your order');
    expect(dialog.textContent).toContain('Custom Banner 72 × 36');
    expect(dialog.textContent).toContain('$68.69');
    expect(dialog.textContent).toContain('$16.20');
    const close = Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Back to checkout')!;
    await act(async () => { close.click(); await new Promise(resolve=>setTimeout(resolve,0)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).not.toContain('Custom Banner 72 × 36');
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('customer@example.com');
    expect(scrollIntoView).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount()); host.remove();
    HTMLElement.prototype.scrollIntoView = originalScroll; vi.unstubAllGlobals();
  }
});
