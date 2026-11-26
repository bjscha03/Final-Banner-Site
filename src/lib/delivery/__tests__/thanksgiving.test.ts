import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { etPartsOf, getDeliveryEstimate } from '../engine';
import { isThanksgivingOrderWindow } from '../cutoffs';
import { getOrderDeliveryEstimate } from '../orderEstimate';
import { getSpecialtyDeliveryEstimate } from '../specialty';
import { isSameDayWindowOpen, qualifiesForSaturdayDelivery } from '../../sameDayService';

const require = createRequire(import.meta.url);
const server = require('../../../../netlify/functions/_shared/delivery/orderEstimate.cjs');
const rush = require('../../../../netlify/functions/_shared/sameDayService.cjs');
const { renderOrderDeliveryEstimate } = require('../../../../netlify/functions/_shared/order-delivery-email.cjs');

describe('Thanksgiving 2026 schedule', () => {
  it.each([25, 26, 27, 28, 29].flatMap(day => [0, 9, 13, 21, 22, 23].map(hour =>
    `2026-11-${day}T${String(hour).padStart(2, '0')}:59:59-05:00`,
  )))('keeps all holiday orders on Monday shipment / Tuesday delivery: %s', iso => {
    const now = new Date(iso);
    const estimate = getDeliveryEstimate({ nowET: etPartsOf(now), isHitSelected: true, isSaturdaySelected: true });
    expect(estimate.shipDate.ymd).toBe('2026-11-30');
    expect(estimate.deliveryDate.ymd).toBe('2026-12-01');
    expect(estimate.hitAvailable).toBe(false);
    expect(estimate.cutoffTime.toISOString()).toBe('2026-11-30T05:00:00.000Z');
    expect(isSameDayWindowOpen(now)).toBe(false);
    expect(qualifiesForSaturdayDelivery(now)).toBe(false);
    expect(rush.isSameDayWindowOpen(now)).toBe(false);
    const result = rush.reconcileSameDayFlags({ now, items: [{ product_type: 'banner', quantity: 2, line_total_cents: 16000 }], requestedSameDay: true, requestedSaturday: true });
    expect(result.sameDay).toBe(false);
    expect(result.saturday).toBe(false);
    expect(result.fees.totalAddOnCents).toBe(0);
  });

  it.each([
    ['2026-11-25T04:59:59Z', false],
    ['2026-11-25T05:00:00Z', true],
    ['2026-11-30T04:59:59Z', true],
    ['2026-11-30T05:00:00Z', false],
    ['2027-11-25T17:00:00Z', false],
  ])('uses the exact Eastern Time boundaries without recurring next year: %s', (iso, active) => {
    expect(isThanksgivingOrderWindow(etPartsOf(new Date(iso)).ymd)).toBe(active);
  });

  it('preserves Wednesday shipping for earlier orders and resumes normal service Monday', () => {
    const before = getDeliveryEstimate({ nowET: etPartsOf(new Date('2026-11-24T17:00:00Z')) });
    expect(before.shipDate.ymd).toBe('2026-11-25');
    expect(before.deliveryDate.ymd).toBe('2026-11-27');
    const standard = getDeliveryEstimate({ nowET: etPartsOf(new Date('2026-11-30T05:00:00Z')) });
    expect(standard.weekendLock).toBe(false);
    expect(standard.shipDate.ymd).toBe('2026-12-01');
    expect(standard.deliveryDate.ymd).toBe('2026-12-02');
    expect(isSameDayWindowOpen(new Date('2026-11-30T05:00:00Z'))).toBe(true);
    expect(rush.isSameDayWindowOpen(new Date('2026-11-30T05:00:00Z'))).toBe(true);
  });

  it('keeps saved-order, admin, and email dates aligned even after the notice expires', () => {
    const order = { created_at: '2026-11-26T02:00:00.684Z', items: [{ product_type: 'banner' }] };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-12-10T17:00:00Z'));
      const result = getOrderDeliveryEstimate(order);
      expect(result).toMatchObject({ shipDate: '2026-11-30', deliveryDate: '2026-12-01' });
      expect(server.getOrderDeliveryEstimate(order)).toEqual(result);
      expect(renderOrderDeliveryEstimate(order)).toContain('Tuesday, Dec 1, 2026');
    } finally { vi.useRealTimers(); }
  });

  it('retains the separate specialty schedule and skips the holiday closure', () => {
    const result = getSpecialtyDeliveryEstimate(new Date('2026-11-28T00:00:00Z'));
    expect(result.shipDate.ymd).toBe('2026-12-01');
    expect(result.deliveryDate.ymd).toBe('2026-12-02');
  });
});
