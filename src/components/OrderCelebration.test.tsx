// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrderCelebration from './OrderCelebration';
let root: ReturnType<typeof createRoot>;
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  document.body.style.overflow = 'auto';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  root = createRoot(document.getElementById('root')!);
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });
function mount() {
  act(() => root.render(<React.StrictMode><OrderCelebration orderId="verified-order" /></React.StrictMode>));
  act(() => vi.advanceTimersByTime(1));
}
describe('verified order celebration lifecycle', () => {
  it('supports StrictMode, skip, and restores receipt interaction', () => {
    mount();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.getElementById('root')!.inert).toBe(true);
    act(() => (document.querySelector('button') as HTMLButtonElement).click());
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.getElementById('root')!.inert).toBe(false);
  });
  it('dismisses if the animation never loads and does not replay on remount', () => {
    mount();
    act(() => vi.advanceTimersByTime(7500));
    expect(document.querySelector('iframe')).toBeNull();
    act(() => root.render(null));
    mount();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('leaves reduced-motion confirmation unobstructed', () => {
    reduced = true; mount();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });
  it('restores the page when navigation unmounts an active celebration', () => {
    const timers = vi.spyOn(window, 'setTimeout');
    const clear = vi.spyOn(window, 'clearTimeout');
    mount();
    const watchdog = timers.mock.results[timers.mock.calls.findIndex(call => call[1] === 7500)].value;
    act(() => root.render(null));
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.getElementById('root')!.inert).toBe(false);
    expect(clear).toHaveBeenCalledWith(watchdog);
  });
  it('ignores messages from an unrelated window', () => {
    mount();
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, data: { type: 'bof-celebration-done' }, source: window })));
    expect(document.querySelector('iframe')).not.toBeNull();
    const source = document.querySelector('iframe')!.contentWindow!;
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, data: { type: 'bof-celebration-done' }, source })));
    expect(document.querySelector('iframe')).toBeNull();
  });
});
