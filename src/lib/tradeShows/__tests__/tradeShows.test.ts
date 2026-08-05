import { describe, expect, it } from 'vitest';
import {
  TRADE_SHOWS,
  TRADE_SHOW_INDUSTRIES,
  formatTradeShowDateRange,
  getAllTradeShowPaths,
  getArtworkReadyDate,
  getIndexableTradeShowPaths,
  getTradeShowSeo,
  isIndexableTradeShow,
} from '../tradeShows';

describe('August 2026 trade show data', () => {
  it('contains 75 unique, chronological U.S. events starting after August 5', () => {
    expect(TRADE_SHOWS).toHaveLength(75);
    expect(new Set(TRADE_SHOWS.map((event) => event.slug)).size).toBe(75);
    expect(new Set(getAllTradeShowPaths()).size).toBe(75);
    expect(new Set(TRADE_SHOWS.map((event) => event.state)).size).toBe(23);

    const starts = TRADE_SHOWS.map((event) => event.startDate);
    expect(starts).toEqual([...starts].sort());
    for (const event of TRADE_SHOWS) {
      expect(event.startDate >= '2026-08-06').toBe(true);
      expect(event.startDate <= '2026-08-31').toBe(true);
      expect(event.endDate >= event.startDate).toBe(true);
      expect(TRADE_SHOW_INDUSTRIES).toContain(event.industry);
      expect(event.officialUrl).toMatch(/^https:\/\//);
    }
  });

  it('only publishes the 15 event guides that pass the editorial gate', () => {
    const reviewed = TRADE_SHOWS.filter(isIndexableTradeShow);
    expect(reviewed).toHaveLength(15);
    expect(getIndexableTradeShowPaths()).toHaveLength(15);

    for (const event of reviewed) {
      expect(event.editorial.reviewedAt).toBe('2026-08-05');
      expect(event.editorial.sourceUrl).toMatch(/^https:\/\//);
      expect(event.editorial.venue.length).toBeGreaterThan(3);
      expect(event.editorial.verifiedFacts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps event metadata within search display limits', () => {
    for (const event of TRADE_SHOWS) {
      const seo = getTradeShowSeo(event);
      expect(seo.title.length).toBeLessThanOrEqual(60);
      expect(seo.description.length).toBeLessThanOrEqual(160);
      expect(seo.title).toContain('2026');
    }
  });

  it('formats single- and cross-month date ranges clearly', () => {
    expect(formatTradeShowDateRange(TRADE_SHOWS.find((event) => event.slug === 'magic-las-vegas')!)).toBe('Aug 10–12, 2026');
    expect(formatTradeShowDateRange(TRADE_SHOWS.find((event) => event.slug === 'pwx-2026')!)).toBe('Aug 30–Sep 2, 2026');
  });

  it('places the planning checkpoint five weekdays before opening', () => {
    expect(getArtworkReadyDate('2026-08-10').toISOString().slice(0, 10)).toBe('2026-08-03');
    expect(getArtworkReadyDate('2026-08-12').toISOString().slice(0, 10)).toBe('2026-08-05');
  });
});
