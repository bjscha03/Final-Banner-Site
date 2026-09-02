import { describe, expect, it } from 'vitest';
import { isLaborDayShippingNoticeActive } from './PromoBanner';

describe('Labor Day shipping notice schedule', () => {
  it('is active from September 1 through September 7 Eastern time', () => {
    expect(isLaborDayShippingNoticeActive(Date.parse('2026-09-01T04:00:00Z'))).toBe(true);
    expect(isLaborDayShippingNoticeActive(Date.parse('2026-09-08T03:59:59Z'))).toBe(true);
  });

  it('is hidden outside the announced ordering window', () => {
    expect(isLaborDayShippingNoticeActive(Date.parse('2026-09-01T03:59:59Z'))).toBe(false);
    expect(isLaborDayShippingNoticeActive(Date.parse('2026-09-08T04:00:00Z'))).toBe(false);
  });
});
