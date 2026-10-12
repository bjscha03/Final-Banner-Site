import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

const selection = vi.hoisted(() => ({ sameDayHitService: false, saturdayDelivery: false }));
vi.mock('@/store/cart', () => ({ useCartStore: (select: (state: typeof selection) => unknown) => select(selection) }));
import PriceDeliveryEstimate from './PriceDeliveryEstimate';

afterEach(() => { vi.useRealTimers(); selection.sameDayHitService = false; selection.saturdayDelivery = false; });

it('shows real ship and arrival dates beside the price without an exceptions accordion', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T16:00:00.000Z'));
  const html = renderToStaticMarkup(<PriceDeliveryEstimate />);
  expect(html).toContain('Estimated delivery: Tue, Oct 6');
  expect(html).toContain('Ships Mon, Oct 5');
  expect(html).not.toContain('<details');
  expect(html).not.toContain('Exceptions');
});

it('updates the arrival date when same-day production is selected', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T14:00:00.000Z'));
  const standard = renderToStaticMarkup(<PriceDeliveryEstimate compact />);
  selection.sameDayHitService = true;
  const expedited = renderToStaticMarkup(<PriceDeliveryEstimate compact />);
  expect(standard).toContain('Estimated delivery: Thu, Oct 8');
  expect(expedited).toContain('Estimated delivery: Wed, Oct 7');
  expect(expedited).not.toContain('Ships');
});
