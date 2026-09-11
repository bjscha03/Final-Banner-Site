import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { computeSameDayFeesCents, qualifiesForSaturdayDelivery } from '../sameDayService';
const server = createRequire(import.meta.url)('../../../netlify/functions/_shared/sameDayService.cjs');

describe('Saturday checkout enforcement', () => {
  it.each(['2026-09-11T16:59:59Z', '2026-09-11T17:00:00Z', '2026-01-16T17:59:59Z', '2026-01-16T18:00:00Z', '2026-09-10T14:00:00Z', '2026-09-12T14:00:00Z'])('keeps browser and server eligibility aligned at %s', iso => {
    const now = new Date(iso);
    expect(server.qualifiesForSaturdayDelivery(now)).toBe(qualifiesForSaturdayDelivery(now));
    const result = server.reconcileSameDayFlags({ now, items: [{ product_type: 'banner', quantity: 1, line_total_cents: 8000 }], requestedSameDay: true, requestedSaturday: true });
    expect(result.saturday).toBe(qualifiesForSaturdayDelivery(now));
    expect(result.fees.saturdayFeeCents).toBe(result.saturday ? 5000 : 0);
  });
  it('charges $98 total in service fees when HIT is $48', () => {
    const expected = { sameDayFeeCents: 4800, saturdayFeeCents: 5000, totalAddOnCents: 9800 };
    expect(computeSameDayFeesCents(8000, { sameDay: true, saturday: true })).toEqual(expected);
    expect(server.computeSameDayFeesCents(8000, { sameDay: true, saturday: true })).toEqual(expected);
  });
  it('does not accept Saturday without HIT or for ineligible products', () => {
    const input = { now: new Date('2026-09-11T15:00:00Z'), items: [{ product_type: 'poster', quantity: 1, line_total_cents: 8000 }], requestedSameDay: true, requestedSaturday: true };
    expect(server.reconcileSameDayFlags(input).fees.totalAddOnCents).toBe(0);
    expect(server.reconcileSameDayFlags({ ...input, requestedSameDay: false }).saturday).toBe(false);
  });
});
