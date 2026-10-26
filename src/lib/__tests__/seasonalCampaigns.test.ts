import { describe, expect, it } from 'vitest';
import {
  EVERGREEN_HERO,
  getActiveSeasonalCampaignForDate,
  getCampaignDateIso,
  getHomepageHeroCampaign,
} from '@/lib/seasonalCampaigns';

describe('seasonal campaign selection', () => {
  it('activates the approved campaign on its first and last dates', () => {
    expect(getActiveSeasonalCampaignForDate('2026-08-07')?.id).toBe('back-to-school-fall-kickoff-2026');
    expect(getActiveSeasonalCampaignForDate('2026-08-24')?.id).toBe('back-to-school-fall-kickoff-2026');
  });

  it('hands off from back to school to Halloween without a stale gap', () => {
    expect(getActiveSeasonalCampaignForDate('2026-08-25')?.id).toBe('halloween-events-2026');
  });

  it('returns the evergreen fallback outside an approved campaign window', () => {
    expect(getHomepageHeroCampaign(new Date('2027-05-01T16:00:00Z')).id).toBe(EVERGREEN_HERO.id);
  });

  it('activates each newly approved campaign on its roadmap start date', () => {
    expect(getActiveSeasonalCampaignForDate('2026-08-25')?.id).toBe('halloween-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-01')?.id).toBe('veterans-day-recognition-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-12')?.id).toBe('thanksgiving-community-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-27')?.id).toBe('holiday-sales-2026');
    expect(getActiveSeasonalCampaignForDate('2026-12-01')?.id).toBe('holiday-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-12-24')?.id).toBe('new-year-2027');
    expect(getActiveSeasonalCampaignForDate('2027-01-03')?.id).toBe('business-refresh-2027');
    expect(getActiveSeasonalCampaignForDate('2027-01-04')?.id).toBe('mardi-gras-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-16')?.id).toBe('school-registration-2027');
    expect(getActiveSeasonalCampaignForDate('2027-04-02')?.id).toBe('winter-trade-shows-2027');
  });

  it('hands overlapping windows to the campaign with the nearest expiration', () => {
    expect(getActiveSeasonalCampaignForDate('2026-10-12')?.id).toBe('halloween-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-01')?.id).toBe('veterans-day-recognition-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-12')?.id).toBe('thanksgiving-community-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-26')?.id).toBe('thanksgiving-community-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-27')?.id).toBe('holiday-sales-2026');
    expect(getActiveSeasonalCampaignForDate('2026-12-01')?.id).toBe('holiday-events-2026');
    expect(getActiveSeasonalCampaignForDate('2027-01-02')?.id).toBe('new-year-2027');
    expect(getActiveSeasonalCampaignForDate('2027-01-03')?.id).toBe('business-refresh-2027');
    expect(getActiveSeasonalCampaignForDate('2027-01-04')?.id).toBe('mardi-gras-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-09')?.id).toBe('mardi-gras-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-10')?.id).toBe('business-refresh-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-16')?.id).toBe('school-registration-2027');
    expect(getActiveSeasonalCampaignForDate('2027-04-02')?.id).toBe('winter-trade-shows-2027');
  });

  it('hands off through the January-to-April campaign sequence', () => {
    expect(getActiveSeasonalCampaignForDate('2026-11-30')?.id).toBe('holiday-sales-2026');
    expect(getActiveSeasonalCampaignForDate('2026-12-01')?.id).toBe('holiday-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-12-23')?.id).toBe('holiday-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-12-24')?.id).toBe('new-year-2027');
    expect(getActiveSeasonalCampaignForDate('2027-01-02')?.id).toBe('new-year-2027');
    expect(getActiveSeasonalCampaignForDate('2027-01-03')?.id).toBe('business-refresh-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-09')?.id).toBe('mardi-gras-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-10')?.id).toBe('business-refresh-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-15')?.id).toBe('business-refresh-2027');
    expect(getActiveSeasonalCampaignForDate('2027-02-16')?.id).toBe('school-registration-2027');
    expect(getActiveSeasonalCampaignForDate('2027-04-01')?.id).toBe('school-registration-2027');
    expect(getActiveSeasonalCampaignForDate('2027-04-02')?.id).toBe('winter-trade-shows-2027');
    expect(getActiveSeasonalCampaignForDate('2027-04-30')?.id).toBe('winter-trade-shows-2027');
    expect(getActiveSeasonalCampaignForDate('2027-05-01')).toBeNull();
  });

  it('uses the campaign operating timezone for date boundaries', () => {
    expect(getCampaignDateIso(new Date('2026-08-08T03:30:00Z'))).toBe('2026-08-07');
    expect(getCampaignDateIso(new Date('2026-08-08T04:30:00Z'))).toBe('2026-08-08');
  });
});
