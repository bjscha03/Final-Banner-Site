// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import CustomBannerSize from './CustomBannerSize';

it('hides preset dimensions, reveals custom dimensions on request, and opens restored custom sizes', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = (custom: boolean, width = 6) => act(() => root.render(<CustomBannerSize hasCustomSize={custom}><input aria-label="Width" value={width} readOnly /></CustomBannerSize>));
  const toggle = () => act(() => host.querySelector('button')!.click());
  try {
    render(false);
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    toggle();
    expect(host.querySelector('input')!.value).toBe('6');
    render(true, 7);
    expect(host.querySelector('input')!.value).toBe('7');
    render(false, 6);
    expect(host.querySelector('input')!.value).toBe('6'); // Never collapse in the middle of editing.
    toggle();
    expect(host.querySelector('input')).toBeNull();
    render(true, 9);
    expect(host.querySelector('input')!.value).toBe('9');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
