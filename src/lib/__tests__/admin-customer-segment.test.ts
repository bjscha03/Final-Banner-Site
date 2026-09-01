import { describe, expect, it } from 'vitest';
import {
  adminCustomerSegmentUrlValue,
  resolveAdminCustomerSegment,
  withAdminCustomerSegment,
} from '../admin-customer-segment';

describe('Admin customer segment URL state', () => {
  it('opens direct repeat links and accepts the legacy first-time spelling', () => {
    expect(resolveAdminCustomerSegment('repeat')).toBe('repeat');
    expect(resolveAdminCustomerSegment('new')).toBe('first_time');
    expect(resolveAdminCustomerSegment('first_time')).toBe('first_time');
    expect(resolveAdminCustomerSegment('unknown')).toBe('all');
  });

  it('uses readable canonical URL values', () => {
    expect(adminCustomerSegmentUrlValue('all')).toBeNull();
    expect(adminCustomerSegmentUrlValue('first_time')).toBe('new');
    expect(adminCustomerSegmentUrlValue('repeat')).toBe('repeat');
    expect(adminCustomerSegmentUrlValue('lapsed')).toBe('lapsed');
  });

  it('preserves unrelated URL state while changing or clearing the segment', () => {
    const current = new URLSearchParams('campaign=retention&segment=new');
    const repeat = withAdminCustomerSegment(current, 'repeat');
    const all = withAdminCustomerSegment(repeat, 'all');

    expect(repeat.get('segment')).toBe('repeat');
    expect(repeat.get('campaign')).toBe('retention');
    expect(all.has('segment')).toBe(false);
    expect(all.get('campaign')).toBe('retention');
    expect(current.get('segment')).toBe('new');
  });
});
