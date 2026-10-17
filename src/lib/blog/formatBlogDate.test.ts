// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { formatBlogDate } from './formatBlogDate';
const previous = process.env.TZ;
afterEach(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
it('keeps prerendered dates identical in UTC and visitor timezones', () => {
  for (const timezone of ['UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Auckland']) {
    process.env.TZ = timezone;
    expect(formatBlogDate('2026-10-15')).toBe('October 15, 2026');
  }
});
