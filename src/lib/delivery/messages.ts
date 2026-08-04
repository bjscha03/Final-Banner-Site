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
 * Standard countdown line. Destination is unknown at this stage, so we
 * promise only the estimated ship date and keep carrier transit separate.
 */
export function standardLine(estimate: DeliveryEstimate, remainingMs: number): string {
  return `Order within ${formatCountdown(remainingMs)} for an estimated ship date of ${formatWeekdayLong(estimate.shipDate)}. Free next-day air begins after production.`;
}

/**
 * HIT countdown line. The destination is not known yet, so the offer is
 * expressed as an earlier estimated ship date rather than an arrival promise.
 */
export function hitOfferLine(estimate: DeliveryEstimate, remainingMs: number): string {
  return `Add HIT Service within ${formatCountdown(remainingMs)} for an estimated ship date of ${formatWeekdayLong(estimate.shipDate)}.`;
}

/** Confirmation line shown once HIT has been selected. */
export function hitSelectedLine(estimate: DeliveryEstimate): string {
  return `Same-Day Hit Service active — estimated to ship ${formatWeekdayLong(estimate.shipDate)}. Free next-day air follows production.`;
}

/** Weekend-lock line. */
export function weekendLockLine(estimate: DeliveryEstimate): string {
  return `Orders placed now are estimated to ship ${formatWeekdayLong(estimate.shipDate)}. Carrier transit begins after production.`;
}