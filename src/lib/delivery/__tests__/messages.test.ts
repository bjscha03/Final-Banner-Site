import { describe, expect, it } from 'vitest';
import { getDeliveryEstimate } from '../engine';
import {
  formatCountdown,
  hitOfferLine,
  hitSelectedLine,
  standardLine,
  weekendLockLine,
} from '../messages';
import { etPartsOf, fromET } from '../timezone';

function estimateAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  isHitSelected = false,
) {
  return getDeliveryEstimate({
    nowET: etPartsOf(fromET(year, month, day, hour, minute)),
    isHitSelected,
  });
}

describe('delivery/messages', () => {
  it('formats a clamped, zero-padded countdown', () => {
    expect(formatCountdown(3_661_999)).toBe('01:01:01');
    expect(formatCountdown(-1)).toBe('00:00:00');
  });

  it('shows both expected days in the standard state', () => {
    const estimate = estimateAt(2026, 4, 27, 13, 0);

    expect(standardLine(estimate, 5_000)).toBe(
      'Order within 00:00:05 for expected shipment Tuesday and expected delivery Wednesday.',
    );
  });

  it('shows both faster expected days in the HIT offer', () => {
    const fasterEstimate = estimateAt(2026, 4, 27, 9, 0, true);

    expect(hitOfferLine(fasterEstimate, 5_000)).toBe(
      'Add HIT Service within 00:00:05 for expected shipment Monday and expected delivery Tuesday.',
    );
  });

  it('shows both expected days when HIT is selected', () => {
    const estimate = estimateAt(2026, 4, 27, 9, 0, true);

    expect(hitSelectedLine(estimate)).toBe(
      'Same-Day Hit Service active — expected to ship Monday and arrive Tuesday.',
    );
  });

  it('shows Monday shipment and Tuesday arrival during weekend lock', () => {
    const estimate = estimateAt(2026, 4, 30, 22, 30);

    expect(estimate.state).toBe('weekend_lock');
    expect(weekendLockLine(estimate)).toBe(
      'Orders placed now are expected to ship Monday and arrive Tuesday.',
    );
  });
});
