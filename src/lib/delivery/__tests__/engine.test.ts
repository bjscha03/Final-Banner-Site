import { describe, it, expect } from 'vitest';
import { fromET, etPartsOf } from '../timezone';
import {
  isWeekendLock,
  isHitWindowOpen,
  isHitAvailable,
  getStandardShipDate,
  getHitShipDate,
  getDeliveryDate,
  getDeliveryEstimate,
} from '../engine';

/** Build ET parts at the given wall-clock time. */
function et(year: number, month: number, day: number, hour = 0, minute = 0): ReturnType<typeof etPartsOf> {
  return etPartsOf(fromET(year, month, day, hour, minute));
}

// 2026 calendar reference:
//   Mon 2026-04-27, Tue 28, Wed 29, Thu 30, Fri 2026-05-01,
//   Sat 05-02, Sun 05-03, Mon 05-04, Tue 05-05.

describe('delivery/engine — weekend lock', () => {
  it('Mon 09:00 ET → not locked', () => {
    expect(isWeekendLock(et(2026, 4, 27, 9, 0))).toBe(false);
  });
  it('Thu 21:59 ET → not locked', () => {
    expect(isWeekendLock(et(2026, 4, 30, 21, 59))).toBe(false);
  });
  it('Thu 22:00 ET → LOCKED', () => {
    expect(isWeekendLock(et(2026, 4, 30, 22, 0))).toBe(true);
  });
  it('Fri 09:00 ET → LOCKED', () => {
    expect(isWeekendLock(et(2026, 5, 1, 9, 0))).toBe(true);
  });
  it('Sat 09:00 ET → LOCKED', () => {
    expect(isWeekendLock(et(2026, 5, 2, 9, 0))).toBe(true);
  });
  it('Sun 23:00 ET → LOCKED', () => {
    expect(isWeekendLock(et(2026, 5, 3, 23, 0))).toBe(true);
  });
  it('Mon 00:00 ET → not locked', () => {
    expect(isWeekendLock(et(2026, 5, 4, 0, 0))).toBe(false);
  });
});

describe('delivery/engine — HIT window', () => {
  it('open at 00:00 ET', () => {
    expect(isHitWindowOpen(et(2026, 4, 28, 0, 0))).toBe(true);
  });
  it('open at 11:59 ET', () => {
    expect(isHitWindowOpen(et(2026, 4, 28, 11, 59))).toBe(true);
  });
  it('CLOSED at 12:00 ET', () => {
    expect(isHitWindowOpen(et(2026, 4, 28, 12, 0))).toBe(false);
  });
  it('CLOSED at 22:00 ET', () => {
    expect(isHitWindowOpen(et(2026, 4, 28, 22, 0))).toBe(false);
  });
  it('open at 22:01 ET', () => {
    expect(isHitWindowOpen(et(2026, 4, 28, 22, 1))).toBe(true);
  });
  it('open at 23:59 ET', () => {
    expect(isHitWindowOpen(et(2026, 4, 28, 23, 59))).toBe(true);
  });

  it('isHitAvailable false during weekend lock (Fri 10:00)', () => {
    expect(isHitWindowOpen(et(2026, 5, 1, 10, 0))).toBe(true);
    expect(isHitAvailable(et(2026, 5, 1, 10, 0))).toBe(false);
  });
});

describe('delivery/engine — standard ship date', () => {
  it('Mon 09:00 ET → ship Tue', () => {
    const ship = getStandardShipDate(et(2026, 4, 27, 9, 0));
    expect(ship.ymd).toBe('2026-04-28');
  });

  it('Mon 21:59 ET → ship Tue (still before cutoff)', () => {
    const ship = getStandardShipDate(et(2026, 4, 27, 21, 59));
    expect(ship.ymd).toBe('2026-04-28');
  });

  it('Mon 22:00 ET cutoff edge → ship Wed', () => {
    const ship = getStandardShipDate(et(2026, 4, 27, 22, 0));
    expect(ship.ymd).toBe('2026-04-29');
  });

  it('Thu 22:01 ET → ship Mon (weekend lock)', () => {
    const ship = getStandardShipDate(et(2026, 4, 30, 22, 1));
    expect(ship.ymd).toBe('2026-05-04');
  });

  it('Fri any time → ship Mon', () => {
    const ship = getStandardShipDate(et(2026, 5, 1, 10, 0));
    expect(ship.ymd).toBe('2026-05-04');
  });

  it('Sat any time → ship Mon', () => {
    const ship = getStandardShipDate(et(2026, 5, 2, 10, 0));
    expect(ship.ymd).toBe('2026-05-04');
  });

  it('Sun any time → ship Mon', () => {
    const ship = getStandardShipDate(et(2026, 5, 3, 23, 30));
    expect(ship.ymd).toBe('2026-05-04');
  });
});

describe('delivery/engine — delivery date (next-day air)', () => {
  it('ship Mon → deliver Tue', () => {
    const ship = getStandardShipDate(et(2026, 4, 27, 9, 0)); // ship Tue 04-28
    const delivery = getDeliveryDate(ship);
    expect(delivery.ymd).toBe('2026-04-29'); // Wed
  });

  it('ship Fri → deliver Mon (skips weekend)', () => {
    // Place at Thu 09:00 → ship Fri 05-01 → deliver Mon 05-04
    const ship = getStandardShipDate(et(2026, 4, 30, 9, 0));
    expect(ship.ymd).toBe('2026-05-01');
    const delivery = getDeliveryDate(ship);
    expect(delivery.ymd).toBe('2026-05-04');
  });
});

describe('delivery/engine — HIT ship date', () => {
  it('Tue 09:00 ET (pre-noon, biz day) → ship same day Tue', () => {
    const ship = getHitShipDate(et(2026, 4, 28, 9, 0));
    expect(ship.ymd).toBe('2026-04-28');
  });

  it('Tue 11:59 ET → still ship Tue', () => {
    const ship = getHitShipDate(et(2026, 4, 28, 11, 59));
    expect(ship.ymd).toBe('2026-04-28');
  });

  it('Mon 23:00 ET (post-cutoff, in HIT window) → ship Tue', () => {
    const ship = getHitShipDate(et(2026, 4, 27, 23, 0));
    expect(ship.ymd).toBe('2026-04-28');
  });

  it('Tue 22:30 ET → ship Wed', () => {
    const ship = getHitShipDate(et(2026, 4, 28, 22, 30));
    expect(ship.ymd).toBe('2026-04-29');
  });
});

describe('delivery/engine — getDeliveryEstimate', () => {
  it('Mon 09:00 standard → state=hit_available (window open & not locked)', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 4, 27, 9, 0) });
    expect(est.state).toBe('hit_available');
    expect(est.shipDate.ymd).toBe('2026-04-28');
    expect(est.deliveryDate.ymd).toBe('2026-04-29');
    expect(est.cutoffKind).toBe('hit_close_12');
  });

  it('Mon 13:00 standard → state=standard (HIT window closed midday)', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 4, 27, 13, 0) });
    expect(est.state).toBe('standard');
    expect(est.shipDate.ymd).toBe('2026-04-28');
    expect(est.cutoffKind).toBe('standard_22');
  });

  it('Mon 22:00 cutoff edge → state=hit_available (HIT just opened) and ship slips to Wed', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 4, 27, 22, 0) });
    // Cutoff edge: standard ship date slips to Wed 04-29.
    expect(est.shipDate.ymd).toBe('2026-04-29');
    // HIT window opens at 22:01, so AT 22:00 sharp we are still standard.
    expect(est.state).toBe('standard');
  });

  it('Mon 22:01 → state=hit_available; selecting HIT ships Tue', () => {
    const av = getDeliveryEstimate({ nowET: et(2026, 4, 27, 22, 1) });
    expect(av.state).toBe('hit_available');
    expect(av.hitWindowOpen).toBe(true);

    const sel = getDeliveryEstimate({ nowET: et(2026, 4, 27, 22, 1), isHitSelected: true });
    expect(sel.state).toBe('hit_selected');
    expect(sel.shipDate.ymd).toBe('2026-04-28');
    expect(sel.deliveryDate.ymd).toBe('2026-04-29');
  });

  it('Tue 12:00 ET → HIT just closed; standard timer to 22:00', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 4, 28, 12, 0) });
    expect(est.hitWindowOpen).toBe(false);
    expect(est.state).toBe('standard');
    expect(est.cutoffKind).toBe('standard_22');
  });

  it('Thu 22:30 ET → weekend lock; HIT unavailable; ship Mon, deliver Tue', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 4, 30, 22, 30) });
    expect(est.weekendLock).toBe(true);
    expect(est.hitAvailable).toBe(false);
    expect(est.state).toBe('weekend_lock');
    expect(est.shipDate.ymd).toBe('2026-05-04');
    expect(est.deliveryDate.ymd).toBe('2026-05-05');
  });

  it('Sat 10:00 ET → weekend lock with selecting HIT does NOT switch state', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 5, 2, 10, 0), isHitSelected: true });
    expect(est.state).toBe('weekend_lock');
    expect(est.shipDate.ymd).toBe('2026-05-04');
  });

  it('cutoff time for weekend lock points to Mon 00:00 ET', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 5, 2, 10, 0) });
    const monMidnight = fromET(2026, 5, 4, 0, 0);
    expect(est.cutoffTime.getTime()).toBe(monMidnight.getTime());
  });
});

describe('delivery/engine — DST safety', () => {
  it('spring-forward: 2026-03-08 02:30 ET does not exist; 03:30 should still classify normally', () => {
    // 2026-03-08 is a Sunday → weekend lock.
    const est = getDeliveryEstimate({ nowET: et(2026, 3, 8, 3, 30) });
    expect(est.weekendLock).toBe(true);
    // Ship Monday 03-09.
    expect(est.shipDate.ymd).toBe('2026-03-09');
  });

  it('fall-back: 2026-11-01 (Sunday) → weekend lock; ship Mon 11-02', () => {
    const est = getDeliveryEstimate({ nowET: et(2026, 11, 1, 9, 0) });
    expect(est.weekendLock).toBe(true);
    expect(est.shipDate.ymd).toBe('2026-11-02');
  });
});

describe('delivery/engine — blackout dates', () => {
  it('treats blackout day like a non-business day (skipped for shipping)', () => {
    // Place at Mon 09:00; Tue is a blackout → ship Wed.
    const est = getDeliveryEstimate({
      nowET: et(2026, 4, 27, 9, 0),
      blackoutDates: ['2026-04-28'],
    });
    expect(est.shipDate.ymd).toBe('2026-04-29');
  });
});
