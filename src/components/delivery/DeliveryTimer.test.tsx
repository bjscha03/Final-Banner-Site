import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryTimer } from './DeliveryTimer';

const cartSnapshot = vi.hoisted(() => ({ sameDayHitService: false, saturdayDelivery: false }));

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
  cartSnapshot.saturdayDelivery = false;
  vi.useRealTimers();
});

describe('DeliveryTimer', () => {
  it('shows calendar dates instead of a weekend reset countdown', () => {
    // The observed Friday checkout session: the old clock read about 56 hours.
    const html = renderAt('2026-10-02T19:38:42.000Z');
    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Estimated delivery');
    expect(html).toContain('Tuesday, October 6');
    expect(html).toContain('Monday, October 5');
    expect(html).toContain('Free next-business-day air after production.');
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain('Next production window');
    expect(html).not.toMatch(/\d{2}:\d{2}:\d{2}/);
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
    expect(html).toContain('Tuesday, August 11');
    expect(html).toContain('Monday, August 10');
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain('Expected ship</p>');
  });

  it('renders the Labor Day 2026 holiday lock on Friday with a Tue/Wed schedule', () => {
    // Friday, September 4, 2026 at noon ET. Tuesday midnight is 84 hours away.
    const html = renderAt('2026-09-04T16:00:00.000Z');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Wednesday, September 9');
    expect(html).toContain('Tuesday');
    expect(html).toContain('Wednesday');
    expect(html).not.toContain('Monday');
    expect(html).not.toContain('role="timer"');
  });

  it('renders the Labor Day 2026 holiday lock on Labor Day itself with calendar dates', () => {
    // Monday, September 7, 2026 (Labor Day) at noon ET. Tuesday midnight is 12 hours away.
    const html = renderAt('2026-09-07T16:00:00.000Z');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Wednesday, September 9');
    expect(html).toContain('Tuesday');
    expect(html).toContain('Wednesday');
    expect(html).not.toContain('role="timer"');
  });

  it('renders the Labor Day holiday lock as a slim checkout strip with Tuesday/Wednesday without a countdown', () => {
    const html = renderSlimAt('2026-09-07T16:00:00.000Z');

    expect(html).toContain('data-variant="slim"');
    expect(html).toContain('Wednesday, September 9');
    expect(html).toContain('Tuesday, September 8');
    expect(html).not.toContain('role="timer"');
  });

  it('exits the Labor Day lock automatically at Tuesday 12:00 AM ET', () => {
    // Tuesday, September 8, 2026 at 12:00 AM ET.
    const html = renderAt('2026-09-08T04:00:00.000Z');

    expect(html).toContain('data-state="hit_available"');
    expect(html).not.toContain('data-state="weekend_lock"');
  });
});

describe('Friday delivery selection', () => {
  it('shows Monday for HIT and Saturday for the paid upgrade', () => {
    cartSnapshot.sameDayHitService = true;
    expect(renderSlimAt('2026-09-11T16:59:59Z', true)).toContain('HIT active · expected Monday delivery');
    cartSnapshot.saturdayDelivery = true;
    expect(renderSlimAt('2026-09-11T16:59:59Z', true)).toContain('HIT active · expected Saturday delivery');
    expect(renderSlimAt('2026-09-11T17:00:00Z', true)).toContain('Tuesday, September 15');
  });
});
