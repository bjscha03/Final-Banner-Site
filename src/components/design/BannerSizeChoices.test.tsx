// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import BannerSizeChoices from './BannerSizeChoices';
import ConfigCard from './layout/ConfigCard';

it('preserves controlled selection and size callbacks through the shared wrapper and unit changes', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const sizes = [{ w: 72, h: 36 }, { w: 96, h: 48 }];
  const render = (unit: 'ft' | 'in', widthIn: number, heightIn: number) => act(() => root.render(
    <ConfigCard id="size-section"><BannerSizeChoices sizes={sizes} widthIn={widthIn} heightIn={heightIn} unit={unit} onSelect={onSelect} /></ConfigCard>
  ));
  try {
    render('ft', 72, 36);
    const buttons = () => host.querySelectorAll('button');
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('false');
    act(() => buttons()[1].click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
    render('ft', 96, 48);
    render('in', 96, 48);
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[1].getAttribute('aria-label')).toContain('96" × 48"');
    expect(host.innerHTML).not.toMatch(/MOST_POPULAR|Most popular/);
    render('in', 100, 50);
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
