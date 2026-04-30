/**
 * Dynamic Delivery Engine
 *
 * Pure functions, fully driven by Eastern Time. Implements:
 *
 *   STANDARD:
 *     time < 22:00 ET            → ship = next business day
 *     time >= 22:00 ET           → ship = business day AFTER next business day
 *     Thu >= 22:00 ET, Fri/Sat/Sun (any time) → ship = next Monday (weekend lock)
 *
 *   HIT (Same-Day Hit Service):
 *     Window: 22:01 ET (prev day) → 12:00 ET (exclusive at 12:00).
 *     Disabled during weekend lock.
 *     When selected:
 *       - 00:00–12:00 ET on a business day → ship same day, deliver next biz day.
 *       - 22:01–23:59 ET (prev day was business day) → ship next biz day,
 *         deliver next biz day after that. (Real carrier limits — production
 *         finishes overnight but pickup is on the next business day.)
 *
 *   DELIVERY = ship + 1 next-day-air business day.
 *
 *   Holidays in BLACKOUT_DATES behave exactly like weekends.
 */

import { addDaysET, atETClock, ETParts, etPartsOf, nowET } from './timezone';
import { BLACKOUT_DATES, HIT_CLOSE, HIT_OPEN, STANDARD_CUTOFF } from './cutoffs';

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

function isWeekendDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function isBlackout(parts: ETParts, blackoutDates: string[]): boolean {
  return blackoutDates.includes(parts.ymd);
}

function isBusinessDay(parts: ETParts, blackoutDates: string[] = BLACKOUT_DATES): boolean {
  return !isWeekendDay(parts.dayOfWeek) && !isBlackout(parts, blackoutDates);
}

function nextBusinessDay(parts: ETParts, blackoutDates: string[] = BLACKOUT_DATES): ETParts {
  let p = addDaysET(parts, 1);
  while (!isBusinessDay(p, blackoutDates)) {
    p = addDaysET(p, 1);
  }
  return p;
}

function ensureBusinessDay(parts: ETParts, blackoutDates: string[] = BLACKOUT_DATES): ETParts {
  let p = parts;
  while (!isBusinessDay(p, blackoutDates)) {
    p = addDaysET(p, 1);
  }
  return p;
}

// ---------------------------------------------------------------------------
// State predicates
// ---------------------------------------------------------------------------

/**
 * Compare two `(hour, minute)` clock points.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function cmpClock(a: { hour: number; minute: number }, b: { hour: number; minute: number }): number {
  if (a.hour !== b.hour) return a.hour - b.hour;
  return a.minute - b.minute;
}

/**
 * Weekend lock is active when:
 *   - day is Friday, Saturday, or Sunday (any time), OR
 *   - day is Thursday and the time is at or after 22:00 ET, OR
 *   - day is a blackout date.
 *
 * Holidays adjacent to the weekend will be naturally absorbed because the
 * shipment date is computed via `nextBusinessDay`.
 */
export function isWeekendLock(parts: ETParts, blackoutDates: string[] = BLACKOUT_DATES): boolean {
  if (isBlackout(parts, blackoutDates)) return true;
  const dow = parts.dayOfWeek;
  if (dow === 5 || dow === 6 || dow === 0) return true; // Fri / Sat / Sun
  if (dow === 4 && cmpClock(parts, STANDARD_CUTOFF) >= 0) return true; // Thu >= 22:00
  return false;
}

/**
 * The HIT window is open from 22:01 ET (yesterday) through 12:00 ET (today),
 * exclusive at 12:00.
 *
 *   - hour < 12                                                → open
 *   - hour == 22 && minute >= 1                                → open
 *   - hour > 22                                                → open
 *   - 12:00 ≤ hour ≤ 22:00 (excluding the 22:01 boundary)      → closed
 */
export function isHitWindowOpen(parts: ETParts): boolean {
  const { hour, minute } = parts;
  // Pre-noon block: open until 12:00 (exclusive).
  if (cmpClock({ hour, minute }, HIT_CLOSE) < 0) return true;
  // Late-evening block: open from 22:01 (inclusive) through 23:59.
  if (cmpClock({ hour, minute }, HIT_OPEN) >= 0) return true;
  return false;
}

/** HIT can be SELECTED only when the window is open AND no weekend lock. */
export function isHitAvailable(parts: ETParts, blackoutDates: string[] = BLACKOUT_DATES): boolean {
  return isHitWindowOpen(parts) && !isWeekendLock(parts, blackoutDates);
}

// ---------------------------------------------------------------------------
// Ship / delivery date computation
// ---------------------------------------------------------------------------

/**
 * Compute the ship date for a STANDARD order placed at `now` ET.
 *
 *   - Weekend lock → next Monday-or-later business day.
 *   - Before 22:00 ET on a business day → tomorrow's next business day.
 *   - At/after 22:00 ET on a business day → business day AFTER next biz day.
 *   - On a non-business day pre-22:00 → next business day (weekend lock
 *     branch will already have caught Sat/Sun; this catches blackout days).
 */
export function getStandardShipDate(now: ETParts, blackoutDates: string[] = BLACKOUT_DATES): ETParts {
  // Weekend lock: ship the upcoming Monday (or the next business day if Monday
  // happens to be a blackout). Per spec, Thu>=22:00 / Fri / Sat / Sun all
  // skip directly to Monday — never Friday.
  if (isWeekendLock(now, blackoutDates)) {
    let p: ETParts = now;
    // Advance until we land on a Monday.
    do {
      p = addDaysET(p, 1);
    } while (p.dayOfWeek !== 1);
    // If that Monday is a blackout, advance to the next business day.
    return ensureBusinessDay(p, blackoutDates);
  }

  // Non-business day (e.g. holiday Tuesday) but not weekend-locked → next biz day.
  if (!isBusinessDay(now, blackoutDates)) {
    return nextBusinessDay(now, blackoutDates);
  }

  // Business day, before 22:00 → next business day.
  if (cmpClock(now, STANDARD_CUTOFF) < 0) {
    return nextBusinessDay(now, blackoutDates);
  }

  // Business day, at/after 22:00 → business day AFTER next business day.
  return nextBusinessDay(nextBusinessDay(now, blackoutDates), blackoutDates);
}

/**
 * Compute the ship date when HIT is selected. Real carrier limits:
 *
 *   - 00:00–12:00 ET on a business day  → ship today (same biz day).
 *   - 22:01–23:59 ET on a business day  → ship next biz day (production
 *     finishes overnight; carrier pickup is the following business day).
 *   - Anything else (window-closed)     → fall back to standard ship date.
 *
 * Caller should always check `isHitAvailable` first; the fallback is a
 * safety net so the engine never crashes.
 */
export function getHitShipDate(now: ETParts, blackoutDates: string[] = BLACKOUT_DATES): ETParts {
  if (!isHitAvailable(now, blackoutDates)) {
    return getStandardShipDate(now, blackoutDates);
  }

  // Pre-noon block on a business day → ship today.
  if (cmpClock(now, HIT_CLOSE) < 0) {
    if (isBusinessDay(now, blackoutDates)) {
      return ensureBusinessDay(now, blackoutDates);
    }
    return nextBusinessDay(now, blackoutDates);
  }

  // Late-evening block (22:01+) → ship next business day.
  return nextBusinessDay(now, blackoutDates);
}

/**
 * Delivery = ship date + 1 next-day-air business day. Saturday delivery
 * is handled separately by `Saturday Delivery` add-on (see Same-Day card).
 */
export function getDeliveryDate(shipDate: ETParts, blackoutDates: string[] = BLACKOUT_DATES): ETParts {
  return nextBusinessDay(shipDate, blackoutDates);
}

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

export type DeliveryState = 'standard' | 'hit_selected' | 'hit_available' | 'weekend_lock';

export interface DeliveryEstimateInput {
  /** ET "now" parts. Defaults to live system clock. */
  nowET?: ETParts;
  /** Whether the customer has selected HIT. */
  isHitSelected?: boolean;
  /** Optional blackout-date override (testing). */
  blackoutDates?: string[];
}

export interface DeliveryEstimate {
  /** Renders which UI branch to use. */
  state: DeliveryState;
  /** Whether the HIT window is currently open at all (independent of selection). */
  hitWindowOpen: boolean;
  /** Whether HIT is available to select right now (window open AND not weekend-locked). */
  hitAvailable: boolean;
  /** Whether weekend-lock is active. */
  weekendLock: boolean;

  /** Computed ship day in ET. */
  shipDate: ETParts;
  /** Computed delivery day in ET. */
  deliveryDate: ETParts;

  /** Customer-facing message (see `messages.ts`). */
  message: string;
  /** UTC instant the next state-changing cutoff happens. */
  cutoffTime: Date;
  /** Which cutoff `cutoffTime` represents. */
  cutoffKind: 'standard_22' | 'hit_close_12' | 'weekend_unlock_mon';
}

/**
 * Compute the next cutoff time (UTC instant) given the current state.
 */
function computeNextCutoff(now: ETParts, state: DeliveryState, blackoutDates: string[]): { at: Date; kind: DeliveryEstimate['cutoffKind'] } {
  // Weekend lock: count down to Monday 00:00 ET (or the next non-blackout
  // business day at midnight ET — i.e. the next moment HIT could re-open).
  if (state === 'weekend_lock') {
    let p = addDaysET(now, 1);
    while (!isBusinessDay(p, blackoutDates)) {
      p = addDaysET(p, 1);
    }
    // HIT actually re-opens at the prior business day's 22:01, but for the
    // weekend banner we count to Monday 00:00 — the moment the lock ends.
    return { at: atETClock(p, 0, 0), kind: 'weekend_unlock_mon' };
  }

  // HIT-related: count down to today's 12:00 ET if we're in the pre-noon
  // block; otherwise to the standard 22:00 ET cutoff.
  if (cmpClock(now, HIT_CLOSE) < 0) {
    return { at: atETClock(now, HIT_CLOSE.hour, HIT_CLOSE.minute), kind: 'hit_close_12' };
  }

  // Past noon, before 22:00 → standard countdown to today's 22:00.
  if (cmpClock(now, STANDARD_CUTOFF) < 0) {
    return { at: atETClock(now, STANDARD_CUTOFF.hour, STANDARD_CUTOFF.minute), kind: 'standard_22' };
  }

  // 22:00–23:59 → HIT window just opened; count down to tomorrow's 12:00 ET.
  const tomorrow = addDaysET(now, 1);
  return { at: atETClock(tomorrow, HIT_CLOSE.hour, HIT_CLOSE.minute), kind: 'hit_close_12' };
}

/**
 * Build customer-facing copy for the supplied estimate. Kept inline so the
 * engine can be used standalone (without importing `messages.ts`).
 */
function buildMessage(state: DeliveryState, ship: ETParts, delivery: ETParts): string {
  const shipName = formatWeekdayLong(ship);
  const deliveryName = formatWeekdayLong(delivery);
  switch (state) {
    case 'weekend_lock':
      return `Orders placed now will ship ${shipName} and be delivered ${deliveryName}.`;
    case 'hit_selected':
      return `With Same-Day Hit Service this order will ship ${shipName} and be delivered ${deliveryName}.`;
    case 'hit_available':
      return `Add Same-Day Hit Service to receive by ${deliveryName}.`;
    case 'standard':
    default:
      return `Order before 10:00 PM ET to have it shipped ${shipName} and delivered ${deliveryName}.`;
  }
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatWeekdayLong(parts: ETParts): string {
  return WEEKDAY_NAMES[parts.dayOfWeek] ?? '';
}

/**
 * Main engine entry point.
 */
export function getDeliveryEstimate(input: DeliveryEstimateInput = {}): DeliveryEstimate {
  const blackoutDates = input.blackoutDates ?? BLACKOUT_DATES;
  const now = input.nowET ?? nowET();
  const isHitSelected = !!input.isHitSelected;

  const weekendLock = isWeekendLock(now, blackoutDates);
  const hitWindowOpen = isHitWindowOpen(now);
  const hitAvailable = hitWindowOpen && !weekendLock;

  // Decide state.
  let state: DeliveryState;
  if (weekendLock) {
    state = 'weekend_lock';
  } else if (isHitSelected && hitAvailable) {
    state = 'hit_selected';
  } else if (hitAvailable) {
    state = 'hit_available';
  } else {
    state = 'standard';
  }

  // Compute ship + delivery for the chosen branch.
  const shipDate =
    state === 'hit_selected'
      ? getHitShipDate(now, blackoutDates)
      : getStandardShipDate(now, blackoutDates);
  const deliveryDate = getDeliveryDate(shipDate, blackoutDates);

  const { at: cutoffTime, kind: cutoffKind } = computeNextCutoff(now, state, blackoutDates);
  const message = buildMessage(state, shipDate, deliveryDate);

  return {
    state,
    hitWindowOpen,
    hitAvailable,
    weekendLock,
    shipDate,
    deliveryDate,
    message,
    cutoffTime,
    cutoffKind,
  };
}

// Re-exports so callers only need to import from `engine`.
export { etPartsOf, nowET, addDaysET, atETClock };
