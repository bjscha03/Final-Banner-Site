/**
 * Single source of truth for "now in Eastern Time" used by the delivery
 * engine. We use `Intl` (no `luxon` dependency) — it handles DST correctly
 * via the IANA `America/New_York` zone and keeps the bundle small. Callers
 * must NEVER use raw browser local time.
 */

export const ET_TIME_ZONE = 'America/New_York';

const ET_DTF = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface ETParts {
  /** UTC instant the parts were derived from. */
  date: Date;
  /** ET calendar year. */
  year: number;
  /** ET calendar month (1-12). */
  month: number;
  /** ET calendar day-of-month (1-31). */
  day: number;
  /** ET hour 0-23. */
  hour: number;
  /** ET minute 0-59. */
  minute: number;
  /** ET second 0-59. */
  second: number;
  /** ET day-of-week, 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** ISO date string (YYYY-MM-DD) anchored to ET. */
  ymd: string;
}

/**
 * Decompose a UTC `Date` into ET wall-clock parts.
 */
export function etPartsOf(date: Date = new Date()): ETParts {
  const parts = ET_DTF.formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
  let hour = parseInt(m.hour ?? '0', 10);
  if (hour === 24) hour = 0;
  const year = parseInt(m.year ?? '1970', 10);
  const month = parseInt(m.month ?? '1', 10);
  const day = parseInt(m.day ?? '1', 10);
  const minute = parseInt(m.minute ?? '0', 10);
  const second = parseInt(m.second ?? '0', 10);
  const dayOfWeek = WEEKDAY_INDEX[m.weekday ?? 'Sun'] ?? 0;
  const ymd = `${m.year}-${m.month}-${m.day}`;
  return { date, year, month, day, hour, minute, second, dayOfWeek, ymd };
}

/**
 * "Now" expressed in ET. Always reads `new Date()` — never caches.
 */
export function nowET(): ETParts {
  return etPartsOf(new Date());
}

/**
 * Build a UTC `Date` that lands on the given ET wall-clock components.
 * Sweeps offsets to handle EST/EDT transparently.
 */
export function fromET(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  // Try offsets from -3 to -6 (covers EDT -4 / EST -5 with safety margin).
  for (let offset = -4; offset >= -6; offset--) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, second));
    const p = etPartsOf(guess);
    if (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    ) {
      return guess;
    }
  }
  // Fallback: best-effort EST (-5).
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second));
}

/**
 * Build a UTC `Date` for a given ET wall-clock day at the supplied
 * `(hour, minute)`, identified by `ETParts` (so callers can advance days
 * with `addDaysET` and then anchor a clock).
 */
export function atETClock(parts: { year: number; month: number; day: number }, hour: number, minute = 0, second = 0): Date {
  return fromET(parts.year, parts.month, parts.day, hour, minute, second);
}

/**
 * Add `n` calendar days to an ET wall-clock day. Returns ETParts for that
 * new day at midnight ET (hour/minute/second zeroed).
 */
export function addDaysET(parts: { year: number; month: number; day: number }, n: number): ETParts {
  // Use a UTC anchor at noon ET to avoid landing in a DST gap when adding.
  const anchor = fromET(parts.year, parts.month, parts.day, 12, 0, 0);
  const shifted = new Date(anchor.getTime() + n * 24 * 60 * 60 * 1000);
  const p = etPartsOf(shifted);
  // Normalize to the *date* by re-anchoring at midnight.
  return etPartsOf(fromET(p.year, p.month, p.day, 0, 0, 0));
}
