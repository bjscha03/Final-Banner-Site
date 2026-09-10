import { describe, it, expect } from 'vitest';
import {
  formatDateInTz,
  getHourInTz,
  getDayOfWeekInTz,
  isWeekend,
  isBlackoutDate,
  isBusinessDay,
  addDays,
  addHours,
  getNextBusinessDay,
  ensureBusinessDay,
  setHourInBusinessTz,
  getNextCutoffTime,
  getEstimatedDeliveryDate,

  formatDeliveryDate,
  BUSINESS_TIMEZONE,
  DeliveryConfig,
} from './deliveryTimeHelpers';

const TEST_CONFIG: DeliveryConfig = {
  cutoffHour: 14,
  businessStartHour: 9,
  blackoutDates: [],
};

describe('deliveryTimeHelpers', () => {
  describe('formatDateInTz', () => {
    it('formats date correctly in business timezone', () => {
      // Create a known date in UTC
      const date = new Date('2026-01-15T12:00:00Z');
      const result = formatDateInTz(date, BUSINESS_TIMEZONE);
      // Should be 2026-01-15 (same day in ET)
      expect(result).toBe('2026-01-15');
    });
  });

  describe('getHourInTz', () => {
    it('returns correct hour in business timezone', () => {
      // 3 PM UTC = 10 AM ET (EST is UTC-5)
      const date = new Date('2026-01-15T15:00:00Z');
      const hour = getHourInTz(date, BUSINESS_TIMEZONE);
      expect(hour).toBe(10);
    });
  });

  describe('getDayOfWeekInTz', () => {
    it('returns correct day of week (0=Sun, 6=Sat)', () => {
      // January 15, 2026 is a Thursday
      const date = new Date('2026-01-15T12:00:00Z');
      expect(getDayOfWeekInTz(date, BUSINESS_TIMEZONE)).toBe(4); // Thursday
    });

    it('returns 0 for Sunday', () => {
      // January 18, 2026 is a Sunday
      const date = new Date('2026-01-18T12:00:00Z');
      expect(getDayOfWeekInTz(date, BUSINESS_TIMEZONE)).toBe(0);
    });

    it('returns 6 for Saturday', () => {
      // January 17, 2026 is a Saturday
      const date = new Date('2026-01-17T12:00:00Z');
      expect(getDayOfWeekInTz(date, BUSINESS_TIMEZONE)).toBe(6);
    });
  });

  describe('isWeekend', () => {
    it('returns true for Saturday', () => {
      const saturday = new Date('2026-01-17T12:00:00Z');
      expect(isWeekend(saturday)).toBe(true);
    });

    it('returns true for Sunday', () => {
      const sunday = new Date('2026-01-18T12:00:00Z');
      expect(isWeekend(sunday)).toBe(true);
    });

    it('returns false for weekday', () => {
      const thursday = new Date('2026-01-15T12:00:00Z');
      expect(isWeekend(thursday)).toBe(false);
    });
  });

  describe('isBlackoutDate', () => {
    it('returns true for blackout dates', () => {
      const blackoutDates = ['2026-01-15'];
      const date = new Date('2026-01-15T12:00:00Z');
      expect(isBlackoutDate(date, blackoutDates)).toBe(true);
    });

    it('returns false for non-blackout dates', () => {
      const blackoutDates = ['2026-01-15'];
      const date = new Date('2026-01-16T12:00:00Z');
      expect(isBlackoutDate(date, blackoutDates)).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    it('returns true for regular weekday', () => {
      const thursday = new Date('2026-01-15T12:00:00Z');
      expect(isBusinessDay(thursday, BUSINESS_TIMEZONE, [])).toBe(true);
    });

    it('returns false for weekend', () => {
      const saturday = new Date('2026-01-17T12:00:00Z');
      expect(isBusinessDay(saturday, BUSINESS_TIMEZONE, [])).toBe(false);
    });

    it('returns false for blackout date', () => {
      const thursday = new Date('2026-01-15T12:00:00Z');
      expect(isBusinessDay(thursday, BUSINESS_TIMEZONE, ['2026-01-15'])).toBe(false);
    });
  });

  describe('addDays', () => {
    it('adds days correctly', () => {
      const date = new Date('2026-01-15T12:00:00Z');
      const result = addDays(date, 3);
      expect(formatDateInTz(result, 'UTC')).toBe('2026-01-18');
    });
  });

  describe('addHours', () => {
    it('adds hours correctly', () => {
      const date = new Date('2026-01-15T12:00:00Z');
      const result = addHours(date, 5);
      expect(result.getTime()).toBe(date.getTime() + 5 * 60 * 60 * 1000);
    });
  });

  describe('getNextBusinessDay', () => {
    it('returns Monday when given Friday', () => {
      // January 16, 2026 is Friday
      const friday = new Date('2026-01-16T12:00:00Z');
      const result = getNextBusinessDay(friday);
      expect(getDayOfWeekInTz(result, BUSINESS_TIMEZONE)).toBe(1); // Monday
    });

    it('returns next weekday when given Wednesday', () => {
      // January 14, 2026 is Wednesday
      const wednesday = new Date('2026-01-14T12:00:00Z');
      const result = getNextBusinessDay(wednesday);
      expect(getDayOfWeekInTz(result, BUSINESS_TIMEZONE)).toBe(4); // Thursday
    });

    it('skips blackout dates', () => {
      const wednesday = new Date('2026-01-14T12:00:00Z');
      const result = getNextBusinessDay(wednesday, ['2026-01-15']);
      // Should skip Thursday (blackout) and return Friday
      expect(formatDateInTz(result, BUSINESS_TIMEZONE)).toBe('2026-01-16');
    });
  });

  describe('ensureBusinessDay', () => {
    it('returns same date if already a business day', () => {
      const thursday = new Date('2026-01-15T12:00:00Z');
      const result = ensureBusinessDay(thursday);
      expect(formatDateInTz(result, BUSINESS_TIMEZONE)).toBe('2026-01-15');
    });

    it('returns Monday when given Saturday', () => {
      const saturday = new Date('2026-01-17T12:00:00Z');
      const result = ensureBusinessDay(saturday);
      expect(getDayOfWeekInTz(result, BUSINESS_TIMEZONE)).toBe(1); // Monday
    });
  });

  describe('setHourInBusinessTz', () => {
    it('sets hour correctly in business timezone', () => {
      const date = new Date('2026-01-15T12:00:00Z');
      const result = setHourInBusinessTz(date, 14);
      expect(getHourInTz(result, BUSINESS_TIMEZONE)).toBe(14);
    });
  });


  describe('getNextCutoffTime', () => {
    it('returns today cutoff if before cutoff on business day', () => {
      // 10 AM ET on Thursday Jan 15
      const date = new Date('2026-01-15T15:00:00Z'); // 10 AM ET
      const result = getNextCutoffTime(date, TEST_CONFIG);
      expect(formatDateInTz(result, BUSINESS_TIMEZONE)).toBe('2026-01-15');
      expect(getHourInTz(result, BUSINESS_TIMEZONE)).toBe(14);
    });

    it('returns next business day cutoff if after cutoff', () => {
      // 3 PM ET on Thursday Jan 15
      const date = new Date('2026-01-15T20:00:00Z'); // 3 PM ET
      const result = getNextCutoffTime(date, TEST_CONFIG);
      expect(formatDateInTz(result, BUSINESS_TIMEZONE)).toBe('2026-01-16');
    });

    it('returns Monday cutoff if on weekend', () => {
      // Saturday Jan 17
      const saturday = new Date('2026-01-17T12:00:00Z');
      const result = getNextCutoffTime(saturday, TEST_CONFIG);
      expect(getDayOfWeekInTz(result, BUSINESS_TIMEZONE)).toBe(1); // Monday
    });
  });

  describe('getEstimatedDeliveryDate', () => {
    it('calculates delivery for order before cutoff on business day', () => {
      // 10 AM ET Thursday Jan 15
      // Production: 24h -> 10 AM Friday Jan 16
      // Shipping: Next business day -> Monday Jan 19
      const date = new Date('2026-01-15T15:00:00Z');
      const result = getEstimatedDeliveryDate(date, TEST_CONFIG);
      expect(formatDateInTz(result, BUSINESS_TIMEZONE)).toBe('2026-01-19');
    });

    it('calculates delivery for order after cutoff', () => {
      // 3 PM ET Thursday Jan 15 (after cutoff)
      // Production starts: 9 AM Friday Jan 16
      // Production complete: 9 AM Saturday Jan 17 -> pushed to 9 AM Monday Jan 19
      // Shipping: Next business day -> Tuesday Jan 20
      const date = new Date('2026-01-15T20:00:00Z');
      const result = getEstimatedDeliveryDate(date, TEST_CONFIG);
      expect(formatDateInTz(result, BUSINESS_TIMEZONE)).toBe('2026-01-20');
    });
  });
});
