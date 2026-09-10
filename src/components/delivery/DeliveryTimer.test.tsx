import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryTimer } from './DeliveryTimer';

const cartSnapshot = vi.hoisted(() => ({ sameDayHitService: false }));

vi.mock('@/store/cart', () => ({
  useCartStore: (selector: (state: typeof cartSnapshot) => unknown) => selector(cartSnapshot),
}));

function renderAt(isoTime: string, reflectCartSelection = false): string {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoTime));

  return renderToStaticMarkup(
    <DeliveryTimer variant="compact" reflectCartSelection={reflectCartSelection} />,
  );
}

function renderSlimAt(isoTime: string, reflectCartSelection = false): string {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoTime));

  return renderToStaticMarkup(
    <DeliveryTimer variant="slim" reflectCartSelection={reflectCartSelection} />,
  );
}

afterEach(() => {
  cartSnapshot.sameDayHitService = false;
  vi.useRealTimers();
});

describe('DeliveryTimer', () => {
  it('renders a clock plus both expected days during the Friday weekend state', () => {
    // Friday, August 7, 2026 at noon ET. Monday midnight is 60 hours away.
    const html = renderAt('2026-08-07T16:00:00.000Z');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Order now for expected Tuesday delivery');
    expect(html).toContain('Expected ship');
    expect(html).toContain('Expected delivery');
    expect(html).toContain('Monday');
    expect(html).toContain('Tuesday');
    expect(html).toContain('data-testid="delivery-countdown"');
    expect(html).toContain('role="timer"');
    expect(html).toContain('60:00:00');
    expect(html).toContain('Next production window');
    expect(html).toContain('Eastern Time');
  });

  it('renders standard shipment, delivery, and cutoff countdown together', () => {
    // Monday, April 27, 2026 at 1:00 PM ET: HIT is closed and 10 PM is 9 hours away.
    const html = renderAt('2026-04-27T17:00:00.000Z');

    expect(html).toContain('data-state="standard"');
    expect(html).toContain('Expected Wednesday delivery');
    expect(html).toContain('expected shipment Tuesday and expected delivery Wednesday');
    expect(html).toContain('09:00:00');
    expect(html).toContain("remaining until tonight&#x27;s 10:00 PM ET cutoff");
  });

  it('renders both faster and standard dates while HIT is available', () => {
    // Monday, April 27, 2026 at 9:00 AM ET.
    const html = renderAt('2026-04-27T13:00:00.000Z');

    expect(html).toContain('data-state="hit_available"');
    expect(html).toContain('expected shipment Monday and expected delivery Tuesday');
    expect(html).toContain('Standard option: expected to ship Tuesday and arrive Wednesday');
    expect(html).toContain('04:00:00');
  });

  it('renders both expected days and the hold timer when HIT is selected', () => {
    cartSnapshot.sameDayHitService = true;
    const html = renderAt('2026-04-27T13:00:00.000Z', true);

    expect(html).toContain('data-state="hit_selected"');
    expect(html).toContain('data-hit-selected="true"');
    expect(html).toContain('expected to ship Monday and arrive Tuesday');
    expect(html).toContain('04:00:00');
    expect(html).toContain('remaining to hold your slot');
  });

  it('renders the weekend estimate as a single slim checkout strip', () => {
    const html = renderSlimAt('2026-08-07T16:00:00.000Z');

    expect(html).toContain('data-variant="slim"');
    expect(html).toContain('Expected Tuesday delivery');
    expect(html).toContain('Ships Monday · next production window');
    expect(html).toContain('60:00:00');
    expect(html).not.toContain('Expected ship</p>');
  });

  it('renders the Labor Day 2026 holiday lock on Friday with a Tue/Wed schedule and 84h countdown', () => {
    // Friday, September 4, 2026 at noon ET. Tuesday midnight is 84 hours away.
    const html = renderAt('2026-09-04T16:00:00.000Z');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Order now for expected Wednesday delivery');
    expect(html).toContain('Tuesday');
    expect(html).toContain('Wednesday');
    expect(html).not.toContain('Monday');
    expect(html).toContain('84:00:00');
  });

  it('renders the Labor Day 2026 holiday lock on Labor Day itself with a 12h countdown', () => {
    // Monday, September 7, 2026 (Labor Day) at noon ET. Tuesday midnight is 12 hours away.
    const html = renderAt('2026-09-07T16:00:00.000Z');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Order now for expected Wednesday delivery');
    expect(html).toContain('Tuesday');
    expect(html).toContain('Wednesday');
    expect(html).toContain('12:00:00');
  });

  it('renders the Labor Day holiday lock as a slim checkout strip with Tuesday/Wednesday and extended countdown', () => {
    const html = renderSlimAt('2026-09-07T16:00:00.000Z');

    expect(html).toContain('data-variant="slim"');
    expect(html).toContain('Expected Wednesday delivery');
    expect(html).toContain('Ships Tuesday · next production window');
    expect(html).toContain('12:00:00');
  });

  it('exits the Labor Day lock automatically at Tuesday 12:00 AM ET', () => {
    // Tuesday, September 8, 2026 at 12:00 AM ET.
    const html = renderAt('2026-09-08T04:00:00.000Z');

    expect(html).toContain('data-state="hit_available"');
    expect(html).not.toContain('data-state="weekend_lock"');
  });
});
