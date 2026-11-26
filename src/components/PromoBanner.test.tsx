// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import PromoBanner from './PromoBanner';

let root: Root | undefined;
let container: HTMLDivElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.useRealTimers(); });

it('clearly shows the order window, ship date, delivery date, and product scope', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T02:00:00Z'));
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root!.render(<PromoBanner />));
  expect(container.querySelector('[aria-label="Thanksgiving shipping schedule"]')).not.toBeNull();
  expect(container.textContent).toContain('Wednesday 11/25–Sunday 11/29');
  expect(container.textContent).toContain('Monday 11/30');
  expect(container.textContent).toContain('Tuesday 12/1');
  expect(container.textContent).toContain('Banners, yard signs & car magnets');
  expect(container.textContent).toContain('Displays & signs follow the dates shown at checkout');
});

it('appears and expires automatically at Eastern midnight in an already-open tab', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T04:59:59Z'));
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root!.render(<PromoBanner showStandardPromo />));
  expect(container.textContent).not.toContain('Thanksgiving');
  act(() => vi.advanceTimersByTime(1000));
  expect(container.textContent).toContain('Thanksgiving');
  vi.setSystemTime(new Date('2026-11-30T04:59:59Z'));
  act(() => vi.advanceTimersByTime(1000));
  expect(container.textContent).not.toContain('Thanksgiving');
  expect(container.textContent).toContain('Free next-day air shipping');
});

it('hydrates previously built HTML without a stale holiday notice or mismatch', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T02:00:00Z'));
  container = document.createElement('div');
  container.innerHTML = renderToString(<PromoBanner showStandardPromo />);
  vi.setSystemTime(new Date('2026-11-30T05:00:00Z'));
  const onRecoverableError = vi.fn();
  await act(async () => { root = hydrateRoot(container, <PromoBanner showStandardPromo />, { onRecoverableError }); });
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('Thanksgiving');
});
