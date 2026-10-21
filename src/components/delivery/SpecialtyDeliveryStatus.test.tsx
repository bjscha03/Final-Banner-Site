// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import SpecialtyDeliveryStatus from './SpecialtyDeliveryStatus';
import SpecialtyCartDelivery from './SpecialtyCartDelivery';

const state = vi.hoisted(() => ({items: [{product_type:'specialty'}], sameDayHitService:false, saturdayDelivery:false}));
vi.mock('@/store/cart', () => ({useCartStore: (select: (value: typeof state) => unknown) => select(state)}));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined; document.body.innerHTML=''; vi.useRealTimers();
  state.items=[{product_type:'specialty'}];
});
async function render(element: React.ReactNode) {
  const node=document.createElement('div'); document.body.append(node); root=createRoot(node);
  await act(async () => root?.render(element)); return node;
}
it.each([{ compact: false }, { compact: true }, { featured: true }])('hydrates old shipping HTML without discarding the product page (%j)', async props => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T16:00:00Z'));
  const node = document.createElement('div');
  node.innerHTML = renderToString(<SpecialtyDeliveryStatus {...props} />);
  document.body.append(node);
  vi.setSystemTime(new Date('2026-10-24T16:00:00Z'));
  const onRecoverableError = vi.fn();
  await act(async () => { root = hydrateRoot(node, <SpecialtyDeliveryStatus {...props} />, { onRecoverableError }); });
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(node.textContent).toMatch(/Oct 27|October 27/);
  expect(node.querySelector('[role="timer"]')?.textContent).toBe('53:00:00');
  expect(node.textContent).not.toContain('Oct 21');
});
it('counts down and rolls the shipping dates at the exact Friday cutoff', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T20:59:59Z'));
  const node=await render(<SpecialtyDeliveryStatus/>);
  expect(node.querySelector('[role="timer"]')?.textContent).toBe('00:00:01');
  expect(node.textContent).toContain('Ships Mon, Oct 26');
  await act(async () => vi.advanceTimersByTime(1000));
  expect(node.querySelector('[role="timer"]')?.textContent).toBe('72:00:00');
  expect(node.textContent).toContain('Ships Tue, Oct 27');
  expect(node.textContent).toContain('Delivery Wed, Oct 28');
  expect(node.textContent).toContain('2 p.m. Pacific / 5 p.m. Eastern');
});
it('refreshes immediately when returning to a backgrounded page', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T20:59:59Z'));
  const node=await render(<SpecialtyDeliveryStatus/>);
  await act(async () => {vi.setSystemTime(new Date('2026-10-24T16:00:00Z')); window.dispatchEvent(new Event('focus'));});
  expect(node.textContent).toContain('Ships Tue, Oct 27');
  expect(node.querySelector('[role="timer"]')?.textContent).toBe('53:00:00');
});
it('shows only specialty timing for a specialty-only cart, and both schedules for a mixed cart', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T22:00:00Z'));
  const node=await render(<SpecialtyCartDelivery compact/>);
  expect(node.textContent).toContain('Ships Tue, Oct 27');
  expect(node.querySelector('[data-price-delivery-estimate]')).toBeNull();
  state.items.push({product_type:'banner'});
  await act(async () => root?.render(<SpecialtyCartDelivery compact/>));
  expect(node.querySelector('[data-price-delivery-estimate]')?.textContent).toContain('Ships Mon, Oct 26');
  expect(node.textContent).toContain('Banners, yard signs & car magnets');
  expect(node.textContent).not.toContain('Add Same-Day');
});
