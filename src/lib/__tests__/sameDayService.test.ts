import { describe, it, expect } from 'vitest';
import {
  isSameDayWindowOpen,
  qualifiesForSaturdayDelivery,
  isProductEligible,
  computeSameDayFeesCents,
  evaluateSameDayEligibility,
  getEligibleSubtotalCents,
} from '../sameDayService';

/**
 * Build a Date that resolves to the given ET wall-clock components by sweeping
 * candidate UTC offsets and asking Intl which one lands on the target hour.
 * This avoids hard-coding DST offsets.
 */
function etDate(year: number, month: number, day: number, hour: number, minute: number, second = 0): Date {
  // Try UTC offsets from -3 to -6 (covers EST -5 / EDT -4 with margin)
  for (let offset = -4; offset >= -6; offset--) {
    const d = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, second));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const m: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
    let etHour = parseInt(m.hour, 10);
    if (etHour === 24) etHour = 0;
    if (
      parseInt(m.year, 10) === year &&
      parseInt(m.month, 10) === month &&
      parseInt(m.day, 10) === day &&
      etHour === hour &&
      parseInt(m.minute, 10) === minute
    ) {
      return d;
    }
  }
  throw new Error(`Could not construct ET date ${year}-${month}-${day} ${hour}:${minute}`);
}

describe('Same-Day Hit Service: ET window logic (with new HIT window 22:01–12:00 + weekend lock)', () => {
  // Use Thursday 2026-04-30 (a non-locked weekday) for the pre-noon checks.
  it('Thu 11:59 AM ET → window open', () => {
    expect(isSameDayWindowOpen(etDate(2026, 4, 30, 11, 59))).toBe(true);
  });

  it('Thu 12:00 PM ET → window closed', () => {
    expect(isSameDayWindowOpen(etDate(2026, 4, 30, 12, 0))).toBe(false);
  });

  it('Thu 12:01 PM ET → window closed', () => {
    expect(isSameDayWindowOpen(etDate(2026, 4, 30, 12, 1))).toBe(false);
  });

  it('Thu 21:59 PM ET → window closed (HIT not yet open)', () => {
    expect(isSameDayWindowOpen(etDate(2026, 4, 30, 21, 59))).toBe(false);
  });

  it('Thu 22:00 PM ET → weekend lock begins → window closed', () => {
    expect(isSameDayWindowOpen(etDate(2026, 4, 30, 22, 0))).toBe(false);
  });

  it('Thu 22:01 PM ET → weekend lock active → window closed', () => {
    // Thursday >= 22:00 enters the weekend lock; HIT therefore unavailable.
    expect(isSameDayWindowOpen(etDate(2026, 4, 30, 22, 1))).toBe(false);
  });

  it('Wed 22:01 PM ET (mid-week) → window OPEN (re-opens for late-night HIT)', () => {
    // 2026-04-29 is a Wednesday (no weekend lock).
    expect(isSameDayWindowOpen(etDate(2026, 4, 29, 22, 1))).toBe(true);
  });

  it('Mon 12:00 AM ET → window open again', () => {
    // 2026-05-04 is a Monday.
    expect(isSameDayWindowOpen(etDate(2026, 5, 4, 0, 0))).toBe(true);
  });

  it('Friday any time → window closed (weekend lock)', () => {
    expect(isSameDayWindowOpen(etDate(2026, 5, 1, 9, 0))).toBe(false);
    expect(isSameDayWindowOpen(etDate(2026, 5, 1, 11, 59))).toBe(false);
  });

  it('handles DST: standard-time winter morning is open (Thursday Jan 15)', () => {
    // 2026-01-15 is a Thursday in EST.
    expect(isSameDayWindowOpen(etDate(2026, 1, 15, 9, 0))).toBe(true);
  });

  it('handles DST: daylight-time summer afternoon is closed (Wednesday July 15)', () => {
    // 2026-07-15 is a Wednesday in EDT.
    expect(isSameDayWindowOpen(etDate(2026, 7, 15, 13, 0))).toBe(false);
  });
});

describe('Same-Day Hit Service: Saturday delivery eligibility', () => {
  it('Friday is weekend-locked → never Saturday-eligible', () => {
    // 2026-05-01 is a Friday → weekend lock → no HIT, no Saturday delivery.
    expect(qualifiesForSaturdayDelivery(etDate(2026, 5, 1, 9, 0))).toBe(false);
  });

  it('open window on Thursday → not Saturday-eligible', () => {
    // 2026-04-30 is a Thursday.
    expect(qualifiesForSaturdayDelivery(etDate(2026, 4, 30, 9, 0))).toBe(false);
  });

  it('open window on Monday → not Saturday-eligible', () => {
    // 2026-05-04 is a Monday.
    expect(qualifiesForSaturdayDelivery(etDate(2026, 5, 4, 9, 0))).toBe(false);
  });

  it('after cutoff on Friday → not Saturday-eligible', () => {
    expect(qualifiesForSaturdayDelivery(etDate(2026, 5, 1, 13, 0))).toBe(false);
  });
});

describe('Same-Day Hit Service: product eligibility', () => {
  it('banner under threshold → eligible', () => {
    expect(isProductEligible('banner', 1)).toBe(true);
  });

  it('banner over threshold → not eligible', () => {
    expect(isProductEligible('banner', 9999)).toBe(false);
  });

  it('yard sign + magnet are eligible product types', () => {
    expect(isProductEligible('yard_sign', 1)).toBe(true);
    expect(isProductEligible('car_magnet', 1)).toBe(true);
  });

  it('design_deposit / unknown / poster are NOT eligible', () => {
    expect(isProductEligible('design_deposit', 1)).toBe(false);
    expect(isProductEligible('poster', 1)).toBe(false);
    expect(isProductEligible(undefined, 1)).toBe(false);
  });
});

describe('Same-Day Hit Service: fee computation', () => {
  it('60% of eligible subtotal, rounded to nearest cent', () => {
    const fees = computeSameDayFeesCents(10000, { sameDay: true, saturday: false });
    expect(fees.sameDayFeeCents).toBe(6000);
    expect(fees.saturdayFeeCents).toBe(0);
    expect(fees.totalAddOnCents).toBe(6000);
  });

  it('Saturday flat fee stacks ON TOP of 60% upcharge', () => {
    const fees = computeSameDayFeesCents(10000, { sameDay: true, saturday: true });
    expect(fees.sameDayFeeCents).toBe(6000);
    expect(fees.saturdayFeeCents).toBe(4500);
    expect(fees.totalAddOnCents).toBe(10500);
  });

  it('Saturday alone (sameDay=false) yields zero fees', () => {
    const fees = computeSameDayFeesCents(10000, { sameDay: false, saturday: true });
    expect(fees.sameDayFeeCents).toBe(0);
    expect(fees.saturdayFeeCents).toBe(0);
  });

  it('eligible subtotal excludes non-eligible product types (no posters)', () => {
    const subtotal = getEligibleSubtotalCents([
      { product_type: 'banner', quantity: 1, line_total_cents: 5000 },
      { product_type: 'poster', quantity: 1, line_total_cents: 9999 },
      { product_type: 'design_deposit', quantity: 1, line_total_cents: 1900 },
      { product_type: 'yard_sign', quantity: 10, line_total_cents: 7500 },
    ]);
    expect(subtotal).toBe(12500);
  });
});

describe('Same-Day Hit Service: evaluateSameDayEligibility', () => {
  it('reports window_closed after noon ET', () => {
    const result = evaluateSameDayEligibility({
      now: etDate(2026, 4, 30, 12, 0),
      items: [{ product_type: 'banner', quantity: 1, line_total_cents: 5000 }],
    });
    expect(result.windowOpen).toBe(false);
    expect(result.reason).toBe('window_closed');
  });

  it('reports no_eligible_items when nothing matches', () => {
    const result = evaluateSameDayEligibility({
      now: etDate(2026, 4, 30, 9, 0),
      items: [{ product_type: 'design_deposit', quantity: 1, line_total_cents: 1900 }],
    });
    expect(result.windowOpen).toBe(true);
    expect(result.hasEligibleItem).toBe(false);
    expect(result.reason).toBe('no_eligible_items');
  });

  it('available on Thursday morning (eligible item, no Saturday because Friday is weekend-locked)', () => {
    const result = evaluateSameDayEligibility({
      now: etDate(2026, 4, 30, 10, 0),
      items: [{ product_type: 'banner', quantity: 1, line_total_cents: 5000 }],
    });
    expect(result.windowOpen).toBe(true);
    expect(result.hasEligibleItem).toBe(true);
    expect(result.saturdayEligible).toBe(false);
    expect(result.reason).toBe('available');
    expect(result.eligibleSubtotalCents).toBe(5000);
  });
});
