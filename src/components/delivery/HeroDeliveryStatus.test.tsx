// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeroDeliveryStatus from './HeroDeliveryStatus';

let root: Root | undefined;
let container: HTMLDivElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderAt(isoTime: string, variant: 'compact' | 'editorial' | 'light' | 'arrival' = 'compact'): string {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoTime));

  container = document.createElement('div');
  root = createRoot(container);
  act(() => root!.render(<HeroDeliveryStatus variant={variant} />));
  return container.innerHTML;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  vi.useRealTimers();
});

describe('HeroDeliveryStatus', () => {
  it.each(['compact', 'light', 'editorial', 'arrival'] as const)('renders holiday dates without a reset countdown (%s)', (variant) => {
    // Friday, September 4, 2026 at noon ET.
    const html = renderAt('2026-09-04T16:00:00.000Z', variant);

    expect(html).not.toContain('role="timer"');
    expect(html).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Tuesday, September 8');
    expect(html).toContain('Wednesday, September 9');
  });

  it('renders Tue, Sep 8 ship and Wed, Sep 9 delivery during the Labor Day 2026 holiday window (editorial)', () => {
    // Monday, September 7, 2026 (Labor Day) at noon ET.
    const html = renderAt('2026-09-07T16:00:00.000Z', 'editorial');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('data-variant="editorial"');
    expect(html).toContain('Tuesday, September 8');
    expect(html).toContain('Wednesday, September 9');
  });

  it('returns to normal scheduling automatically at Tuesday 12:00 AM ET', () => {
    const html = renderAt('2026-09-08T04:00:00.000Z', 'compact');

    expect(html).not.toContain('data-state="weekend_lock"');
    expect(html).toContain('Wed, Sep 9');
    expect(html).toContain('Thu, Sep 10');
  });

  it('shows the actual arrival and ship dates in the compact mobile hero', () => {
    const html = renderAt('2026-10-04T16:00:00.000Z', 'arrival');

    expect(html).toContain('Estimated delivery');
    expect(html).toContain('Tuesday, October 6');
    expect(html).toContain('Expected to ship Monday, October 5');
    expect(html).toContain('data-variant="arrival"');
  });
});


describe('prerendered delivery hydration', () => {
  it.each(['compact', 'light', 'editorial', 'arrival'] as const)('hydrates a days-old page without mismatches and shows current dates (%s)', async variant => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T16:00:00Z'));
    const html = renderToStaticMarkup(<HeroDeliveryStatus variant={variant} />);
    container = document.createElement('div');
    container.innerHTML = html;
    vi.setSystemTime(new Date('2026-10-06T14:00:00Z'));
    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, <HeroDeliveryStatus variant={variant} />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Oct 8|October 8/);
    expect(container.textContent).not.toMatch(/Oct 6|October 6/);
  });
});
