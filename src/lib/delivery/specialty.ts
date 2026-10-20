import { BLACKOUT_DATES } from './cutoffs';
import { addDaysET, atETClock, etPartsOf, type ETParts } from './timezone';

// Displays/signs use their own schedule. Do not change the banner engine's
// 10 PM cutoff, weekend production, HIT or Saturday delivery rules.
// 2 PM America/Los_Angeles is 5 PM America/New_York in both standard and
// daylight time. Reuse the timezone-safe calendar helpers, not device time.
export const SPECIALTY_CUTOFF_HOUR_ET = 17;
export const SPECIALTY_CUTOFF_LABEL = '2 p.m. Pacific / 5 p.m. Eastern';

export function getSpecialtyDeliveryEstimate(now = new Date(), blackoutDates = BLACKOUT_DATES) {
  const current = etPartsOf(now);
  const businessDay = (day: ETParts) => day.dayOfWeek !== 0 && day.dayOfWeek !== 6 && !blackoutDates.includes(day.ymd);
  const nextBusinessDay = (day: ETParts) => {
    let next = addDaysET(day, 1);
    while (!businessDay(next)) next = addDaysET(next, 1);
    return next;
  };
  const beforeCutoff = businessDay(current) && current.hour < SPECIALTY_CUTOFF_HOUR_ET;
  const processingDate = beforeCutoff ? current : nextBusinessDay(current);
  const cutoffTime = atETClock(processingDate, SPECIALTY_CUTOFF_HOUR_ET);
  const shipDate = nextBusinessDay(processingDate);
  const deliveryDate = nextBusinessDay(shipDate);
  return {
    cutoffTime, processingDate, shipDate, deliveryDate,
    remainingMs: Math.max(0, cutoffTime.getTime() - now.getTime()),
  };
}

export function specialtyDateLabel(date: ETParts) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date.ymd}T12:00:00Z`));
}
