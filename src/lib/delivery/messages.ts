/**
 * Customer-facing copy + countdown formatting for the Dynamic Delivery
 * Timer. Kept separate from the engine so that the engine remains a pure
 * data layer that can be unit-tested independently of UI strings.
 */

import { DeliveryEstimate, formatWeekdayLong } from './engine';

/** Format milliseconds → "HH:MM:SS" (clamped at zero). */
export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Standard countdown line:
 *   "Order within HH:MM:SS to have it shipped <SHIP DAY> and delivered <DELIVERY DAY>"
 */
export function standardLine(estimate: DeliveryEstimate, remainingMs: number): string {
  return `Order within ${formatCountdown(remainingMs)} to have it shipped ${formatWeekdayLong(estimate.shipDate)} and delivered ${formatWeekdayLong(estimate.deliveryDate)}.`;
}

/**
 * HIT countdown line:
 *   "Add HIT Service within HH:MM:SS to receive by <FASTER DELIVERY DATE>"
 *
 * Note `estimate` here should be computed with `isHitSelected = true` so the
 * `deliveryDate` reflects the faster (HIT-overridden) date.
 */
export function hitOfferLine(estimate: DeliveryEstimate, remainingMs: number): string {
  return `Add HIT Service within ${formatCountdown(remainingMs)} to receive by ${formatWeekdayLong(estimate.deliveryDate)}.`;
}

/** Confirmation line shown once HIT has been selected. */
export function hitSelectedLine(estimate: DeliveryEstimate): string {
  return `Same-Day Hit Service active — shipping ${formatWeekdayLong(estimate.shipDate)}, delivered ${formatWeekdayLong(estimate.deliveryDate)}.`;
}

/** Weekend-lock line. */
export function weekendLockLine(estimate: DeliveryEstimate): string {
  return `Orders placed now will ship ${formatWeekdayLong(estimate.shipDate)} and be delivered ${formatWeekdayLong(estimate.deliveryDate)}.`;
}
