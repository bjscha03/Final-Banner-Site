/**
 * Operational cutoff constants for the dynamic delivery timer system.
 *
 * Standard cutoff:
 *   Orders placed BEFORE 22:00 ET ship next business day.
 *   Orders placed AT or AFTER 22:00 ET ship the business day AFTER.
 *
 * Weekend lock:
 *   Any order placed Thursday >= 22:00 ET, or any time Fri/Sat/Sun, ships
 *   the following Monday (or next non-blackout business day).
 *
 * HIT (Same-Day Hit Service) window:
 *   Open from 22:01 ET (previous calendar day) through 12:00 ET, inclusive
 *   of 12:00. Outside this window the option is hidden.
 *   HIT is unavailable while the weekend lock is in effect.
 */

export const STANDARD_CUTOFF = { hour: 22, minute: 0 } as const;

/** Window opens AT 22:01 ET on the previous calendar day (inclusive). */
export const HIT_OPEN  = { hour: 22, minute: 1 } as const;
/** Window closes AT 12:00 ET (exclusive). 12:00:00 ET is closed. */
export const HIT_CLOSE = { hour: 12, minute: 0 } as const;

/**
 * Holidays that should be treated like weekends — production cannot occur,
 * shipments do not move. Format: 'YYYY-MM-DD' anchored to ET.
 */
export const BLACKOUT_DATES: string[] = [
  // '2026-01-01', // New Year's Day
  // '2026-12-25', // Christmas
];
