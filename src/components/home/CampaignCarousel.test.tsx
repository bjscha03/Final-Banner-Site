// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CampaignCarousel from './CampaignCarousel';

let container: HTMLDivElement;
let root: Root;
let reducedMotion = false;
const render = async () => { await act(async () => { root.render(<MemoryRouter><CampaignCarousel /></MemoryRouter>); }); };
const click = async (label: string) => { await act(async () => { (container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click(); }); };
const current = () => container.querySelector('.campaign-slide:not([hidden])')!;
const advance = async () => { await act(async () => { vi.advanceTimersByTime(6500); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  reducedMotion = false;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('cycles through all five products with working product destinations and wraps', async () => {
  await render();
  const destinations = ['/design?product=banner', '/design?product=yard-signs', '/design?product=car-magnets', '/products/standard-retractable-banner', '/products/feather-flags'];
  for (const destination of destinations) {
    expect(container.querySelectorAll('.campaign-slide:not([hidden])')).toHaveLength(1);
    expect(current().querySelector('a')?.getAttribute('href')).toBe(destination);
    await click('Next slide');
  }
  expect(current().textContent).toContain('Big ideas.');
  await click('Previous slide');
  expect(current().textContent).toContain('From the street.');
});

it('pauses after user navigation and can explicitly resume', async () => {
  await render();
  await advance();
  expect(current().textContent).toContain('Small sign.');
  await click('Show Custom car magnets');
  await advance();
  expect(current().textContent).toContain('Your brand.');
  await click('Play slideshow');
  await advance();
  expect(current().textContent).toContain('Show up.');
});

it('honors reduced motion by waiting for an explicit play action', async () => {
  reducedMotion = true;
  await render();
  await advance();
  expect(current().textContent).toContain('Big ideas.');
  expect(container.querySelector('[aria-label="Play slideshow"]')).not.toBeNull();
});

it('pauses when a keyboard user focuses a product link and supports arrow navigation', async () => {
  await render();
  await act(async () => { (current().querySelector('a') as HTMLAnchorElement).focus(); });
  await advance();
  expect(current().textContent).toContain('Big ideas.');
  await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  expect(current().textContent).toContain('Small sign.');
});

it('responds to a horizontal swipe without hijacking vertical scrolling', async () => {
  await render();
  const stage = container.querySelector('.campaign-stage')!;
  const swipe = async (x: number, y: number) => {
    await act(async () => {
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ clientX: 200, clientY: 200 }] });
      stage.dispatchEvent(start);
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
      stage.dispatchEvent(end);
    });
  };
  await swipe(130, 50);
  expect(current().textContent).toContain('Big ideas.');
  await swipe(100, 205);
  expect(current().textContent).toContain('Small sign.');
});
