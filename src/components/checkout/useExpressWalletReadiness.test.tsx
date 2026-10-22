// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useExpressWalletReadiness } from './useExpressWalletReadiness';

let state: ReturnType<typeof useExpressWalletReadiness>;
let root: ReturnType<typeof createRoot>;
function Harness() { state = useExpressWalletReadiness(); return null; }
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['applePay', 'googlePay'] as const)('does not reveal a partially discovered row when %s finishes first', (first) => {
  const second = first === 'applePay' ? 'googlePay' : 'applePay';
  expect(state.ready).toBe(false);
  act(() => state.report(first, true));
  expect(state.ready).toBe(false);
  act(() => state.report(second, false));
  expect(state.ready).toBe(true);
  expect(state.availability).toEqual({ [first]: true, [second]: false });
});

it('settles when both providers fail or are unavailable', () => {
  act(() => { state.report('applePay', false); state.report('googlePay', false); });
  expect(state.ready).toBe(true);
  expect(Object.values(state.availability).some(Boolean)).toBe(false);
});

it('stops the placeholder after eight seconds and still accepts a late ready wallet', () => {
  act(() => { state.report('applePay', false); vi.advanceTimersByTime(7999); });
  expect(state.ready).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(state.ready).toBe(true);
  act(() => state.report('googlePay', true));
  expect(state.availability.googlePay).toBe(true);
});

it('reflects a wallet becoming unavailable again without restarting the loader', () => {
  act(() => { state.report('applePay', true); state.report('googlePay', true); });
  act(() => state.report('applePay', false));
  expect(state.ready).toBe(true);
  expect(state.availability).toEqual({ applePay: false, googlePay: true });
});
