// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FadingGoogleReviews } from './GoogleReviewSpotlight';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let hidden = false;
let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  hidden = false;
  reducedMotion = false;
});

const current = () => container.querySelector('figure[aria-hidden="false"]')!;
const advance = () => act(() => vi.advanceTimersByTime(6000));
const click = (label: string) => act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());

it('cycles through all seven reviews, wraps, and pauses when requested or the tab is hidden', () => {
  act(() => root.render(<FadingGoogleReviews />));
  const seen = new Set<string>();
  for (let i = 0; i < 7; i++) {
    expect(container.querySelectorAll('figure[aria-hidden="false"]')).toHaveLength(1);
    seen.add(current().querySelector('figcaption')!.textContent!);
    advance();
  }
  expect(seen.size).toBe(7);
  expect(current().textContent).toContain('Alma Sanchez');
  click('Pause Google reviews');
  advance();
  expect(current().textContent).toContain('Alma Sanchez');
  click('Next Google review');
  expect(current().textContent).toContain('Greg Hood');
  click('Play Google reviews');
  advance();
  expect(current().textContent).toContain('Tasha Forrest');
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  advance();
  expect(current().textContent).toContain('Tasha Forrest');
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  advance();
  expect(current().textContent).toContain('Nicole Tedesche');
});

it('keeps every review accessible manually when reduced motion disables automatic rotation', () => {
  reducedMotion = true;
  act(() => root.render(<FadingGoogleReviews />));
  advance();
  expect(current().textContent).toContain('Alma Sanchez');
  expect(container.querySelector('button[aria-label="Pause Google reviews"]')).toBeNull();
  const seen = new Set<string>();
  for (let i = 0; i < 7; i++) {
    seen.add(current().querySelector('figcaption')!.textContent!);
    click('Next Google review');
  }
  expect(seen.size).toBe(7);
  expect(current().textContent).toContain('Alma Sanchez');
});
