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

/** Standard countdown line with the engine's expected ship and delivery days. */
export function standardLine(estimate: DeliveryEstimate, remainingMs: number): string {
  return `Order within ${formatCountdown(remainingMs)} for expected shipment ${formatWeekdayLong(estimate.shipDate)} and expected delivery ${formatWeekdayLong(estimate.deliveryDate)}.`;
}

/**
 * HIT countdown line. `estimate` should be computed with
 * `isHitSelected = true` so both dates reflect the faster service.
 */
export function hitOfferLine(estimate: DeliveryEstimate, remainingMs: number): string {
  return `Add HIT Service within ${formatCountdown(remainingMs)} for expected shipment ${formatWeekdayLong(estimate.shipDate)} and expected delivery ${formatWeekdayLong(estimate.deliveryDate)}.`;
}

/** Confirmation line shown once HIT has been selected. */
export function hitSelectedLine(estimate: DeliveryEstimate): string {
  return `Same-Day Hit Service active — expected to ship ${formatWeekdayLong(estimate.shipDate)} and arrive ${formatWeekdayLong(estimate.deliveryDate)}.`;
}

/** Weekend-lock line. */
export function weekendLockLine(estimate: DeliveryEstimate): string {
  return `Orders placed now are expected to ship ${formatWeekdayLong(estimate.shipDate)} and arrive ${formatWeekdayLong(estimate.deliveryDate)}.`;
}
