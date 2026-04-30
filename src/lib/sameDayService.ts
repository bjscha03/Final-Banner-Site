/**
 * Same-Day Hit Service — pure logic shared by client UI and server validation.
 *
 * All time calculations are anchored to America/New_York via Intl, so DST
 * transitions are handled correctly with no manual offset arithmetic.
 *
 * NOTE: Keep this file framework-free — it is mirrored to
 * `netlify/functions/_shared/sameDayService.cjs` for server-side use.
 */

import {
  sameDayConfig,
  getSameDayKeyForProduct,
  SameDayConfig,
  SameDayProductKey,
} from './sameDayConfig';

export interface EasternTimeParts {
  /** ET hour 0..23 */
  hour: number;
  /** ET minute 0..59 */
  minute: number;
  /** ET second 0..59 */
  second: number;
  /** ET day-of-week (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number;
  /** ISO-like ET wall-clock string, e.g. "2026-04-30 11:59:00 ET" */
  display: string;
  /** Original UTC ISO string for reference. */
  utcIso: string;
}

const ET_TIME_ZONE = 'America/New_York';

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

export function getEasternTimeParts(now: Date = new Date()): EasternTimeParts {
  const parts = ET_DTF.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Intl reports hour "24" at midnight in some node versions; normalize.
  let hour = parseInt(map.hour ?? '0', 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute ?? '0', 10);
  const second = parseInt(map.second ?? '0', 10);
  const dayOfWeek = WEEKDAY_INDEX[map.weekday ?? 'Sun'] ?? 0;
  const display = `${map.year}-${map.month}-${map.day} ${String(hour).padStart(2, '0')}:${map.minute}:${map.second} ET`;
  return {
    hour,
    minute,
    second,
    dayOfWeek,
    display,
    utcIso: now.toISOString(),
  };
}

/**
 * The Same-Day window is OPEN from 00:00 ET (inclusive) up to but not
 * including the configured cutoff (default 12:00 ET).
 */
export function isSameDayWindowOpen(now: Date = new Date(), cfg: SameDayConfig = sameDayConfig): boolean {
  if (!cfg.enabled) return false;
  const { hour, minute } = getEasternTimeParts(now);
  if (hour < cfg.cutoffHour) return true;
  if (hour === cfg.cutoffHour && minute < cfg.cutoffMinute) return true;
  return false;
}

/**
 * Saturday Delivery is only meaningful when the same-day window is open AND
 * production happens on a Friday (so the next-day-air shipment arrives
 * Saturday). Mon–Thu next-day-air arrives a normal weekday; Sat/Sun production
 * isn't offered. So eligibility = window open && ET day-of-week is Friday.
 */
export function qualifiesForSaturdayDelivery(now: Date = new Date(), cfg: SameDayConfig = sameDayConfig): boolean {
  if (!isSameDayWindowOpen(now, cfg)) return false;
  return getEasternTimeParts(now).dayOfWeek === 5; // Friday
}

export interface EligibilityItem {
  product_type?: string | null;
  quantity?: number;
  line_total_cents?: number;
}

export function isProductEligible(productType: string | undefined | null, quantity: number, cfg: SameDayConfig = sameDayConfig): boolean {
  const key = getSameDayKeyForProduct(productType);
  if (!key) return false;
  if (!cfg.eligibleProducts.includes(key)) return false;
  const max = cfg.maxQuantities[key];
  if (typeof max === 'number' && quantity > max) return false;
  return true;
}

/**
 * Sum of `line_total_cents` of items eligible for the Same-Day upcharge.
 * Posters and other product types contribute zero.
 */
export function getEligibleSubtotalCents(items: EligibilityItem[], cfg: SameDayConfig = sameDayConfig): number {
  let total = 0;
  for (const item of items) {
    const qty = item.quantity ?? 1;
    if (!isProductEligible(item.product_type ?? undefined, qty, cfg)) continue;
    total += item.line_total_cents ?? 0;
  }
  return total;
}

export interface SameDayFees {
  sameDayFeeCents: number;
  saturdayFeeCents: number;
  totalAddOnCents: number;
}

export function computeSameDayFeesCents(
  eligibleSubtotalCents: number,
  flags: { sameDay: boolean; saturday: boolean },
  cfg: SameDayConfig = sameDayConfig,
): SameDayFees {
  let sameDayFeeCents = 0;
  let saturdayFeeCents = 0;
  if (flags.sameDay && eligibleSubtotalCents > 0) {
    sameDayFeeCents = Math.round(eligibleSubtotalCents * cfg.upchargeRate);
    if (flags.saturday) {
      saturdayFeeCents = Math.round(cfg.saturdayDeliveryFee * 100);
    }
  }
  return {
    sameDayFeeCents,
    saturdayFeeCents,
    totalAddOnCents: sameDayFeeCents + saturdayFeeCents,
  };
}

export interface EvaluateInput {
  now?: Date;
  items: EligibilityItem[];
  cfg?: SameDayConfig;
}

export interface EvaluateResult {
  windowOpen: boolean;
  saturdayEligible: boolean;
  hasEligibleItem: boolean;
  eligibleItems: EligibilityItem[];
  eligibleSubtotalCents: number;
  /** Human-readable reason when offering is unavailable (for logs/UI hints). */
  reason: 'available' | 'window_closed' | 'no_eligible_items' | 'over_max_quantity' | 'feature_disabled';
  ETnow: EasternTimeParts;
}

export function evaluateSameDayEligibility({ now = new Date(), items, cfg = sameDayConfig }: EvaluateInput): EvaluateResult {
  const ETnow = getEasternTimeParts(now);
  if (!cfg.enabled) {
    return {
      windowOpen: false,
      saturdayEligible: false,
      hasEligibleItem: false,
      eligibleItems: [],
      eligibleSubtotalCents: 0,
      reason: 'feature_disabled',
      ETnow,
    };
  }
  const windowOpen = isSameDayWindowOpen(now, cfg);
  const saturdayEligible = qualifiesForSaturdayDelivery(now, cfg);

  const productMatched = items.filter((i) => !!getSameDayKeyForProduct(i.product_type ?? undefined));
  const eligibleItems = items.filter((i) => isProductEligible(i.product_type ?? undefined, i.quantity ?? 1, cfg));
  const eligibleSubtotalCents = getEligibleSubtotalCents(eligibleItems, cfg);

  let reason: EvaluateResult['reason'] = 'available';
  if (!windowOpen) reason = 'window_closed';
  else if (productMatched.length === 0) reason = 'no_eligible_items';
  else if (eligibleItems.length === 0) reason = 'over_max_quantity';

  return {
    windowOpen,
    saturdayEligible,
    hasEligibleItem: eligibleItems.length > 0,
    eligibleItems,
    eligibleSubtotalCents,
    reason,
    ETnow,
  };
}
