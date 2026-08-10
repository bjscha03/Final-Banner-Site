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
    expect(getActiveSeasonalCampaignForDate('2026-09-07')?.id).toBe('back-to-school-fall-kickoff-2026');
  });

  it('expires the campaign immediately after its configured end date', () => {
    expect(getActiveSeasonalCampaignForDate('2026-09-08')).toBeNull();
  });

  it('returns the evergreen fallback outside an approved campaign window', () => {
    expect(getHomepageHeroCampaign(new Date('2027-03-01T16:00:00Z')).id).toBe(EVERGREEN_HERO.id);
  });

  it('activates each newly approved campaign on its roadmap start date', () => {
    expect(getActiveSeasonalCampaignForDate('2026-09-21')?.id).toBe('halloween-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-01')?.id).toBe('veterans-day-recognition-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-12')?.id).toBe('thanksgiving-community-2026');
  });

  it('hands overlapping windows to the campaign with the nearest expiration', () => {
    expect(getActiveSeasonalCampaignForDate('2026-10-12')?.id).toBe('halloween-events-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-01')?.id).toBe('veterans-day-recognition-2026');
    expect(getActiveSeasonalCampaignForDate('2026-11-12')?.id).toBe('thanksgiving-community-2026');
  });

  it('expires the final due campaign after Thanksgiving', () => {
    expect(getActiveSeasonalCampaignForDate('2026-11-27')).toBeNull();
  });

  it('uses the campaign operating timezone for date boundaries', () => {
    expect(getCampaignDateIso(new Date('2026-08-08T03:30:00Z'))).toBe('2026-08-07');
    expect(getCampaignDateIso(new Date('2026-08-08T04:30:00Z'))).toBe('2026-08-08');
  });
});
