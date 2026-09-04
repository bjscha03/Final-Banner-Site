import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeroDeliveryStatus from './HeroDeliveryStatus';

function renderAt(isoTime: string, variant: 'compact' | 'editorial' = 'compact'): string {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoTime));

  return renderToStaticMarkup(<HeroDeliveryStatus variant={variant} />);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroDeliveryStatus', () => {
  it('renders Tue, Sep 8 ship and Wed, Sep 9 delivery during the Labor Day 2026 holiday window (compact)', () => {
    // Friday, September 4, 2026 at noon ET.
    const html = renderAt('2026-09-04T16:00:00.000Z', 'compact');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('Tue, Sep 8');
    expect(html).toContain('Wed, Sep 9');
  });

  it('renders Tue, Sep 8 ship and Wed, Sep 9 delivery during the Labor Day 2026 holiday window (editorial)', () => {
    // Monday, September 7, 2026 (Labor Day) at noon ET.
    const html = renderAt('2026-09-07T16:00:00.000Z', 'editorial');

    expect(html).toContain('data-state="weekend_lock"');
    expect(html).toContain('data-variant="editorial"');
    expect(html).toContain('Tue, Sep 8');
    expect(html).toContain('Wed, Sep 9');
  });

  it('returns to normal scheduling automatically at Tuesday 12:00 AM ET', () => {
    const html = renderAt('2026-09-08T04:00:00.000Z', 'compact');

    expect(html).not.toContain('data-state="weekend_lock"');
    expect(html).toContain('Wed, Sep 9');
    expect(html).toContain('Thu, Sep 10');
  });
});
