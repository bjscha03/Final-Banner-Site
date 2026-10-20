import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { getSpecialtyDeliveryEstimate } from '../specialty';
import { getOrderDeliveryEstimate } from '../orderEstimate';
const require = createRequire(import.meta.url);
const server = require('../../../../netlify/functions/_shared/delivery/orderEstimate.cjs');
const { renderOrderDeliveryEstimate } = require('../../../../netlify/functions/_shared/order-delivery-email.cjs');

describe('display/sign schedule — 2 PM Pacific cutoff', () => {
  it.each([
    ['2026-10-20T20:59:59Z', '2026-10-21', '2026-10-22', '2026-10-20T21:00:00.000Z'],
    ['2026-10-20T21:00:00Z', '2026-10-22', '2026-10-23', '2026-10-21T21:00:00.000Z'],
    ['2026-10-22T21:00:00Z', '2026-10-26', '2026-10-27', '2026-10-23T21:00:00.000Z'],
    ['2026-10-23T20:59:59Z', '2026-10-26', '2026-10-27', '2026-10-23T21:00:00.000Z'],
    ['2026-10-23T21:00:00Z', '2026-10-27', '2026-10-28', '2026-10-26T21:00:00.000Z'],
    ['2026-10-24T15:00:00Z', '2026-10-27', '2026-10-28', '2026-10-26T21:00:00.000Z'],
    ['2026-10-25T23:00:00Z', '2026-10-27', '2026-10-28', '2026-10-26T21:00:00.000Z'],
    // Pacific Sunday evening is already Monday in Eastern time.
    ['2026-10-26T05:30:00Z', '2026-10-27', '2026-10-28', '2026-10-26T21:00:00.000Z'],
    // Winter cutoff is 22:00 UTC; summer cutoff is 21:00 UTC.
    ['2026-11-03T21:59:59Z', '2026-11-04', '2026-11-05', '2026-11-03T22:00:00.000Z'],
    ['2026-11-03T22:00:00Z', '2026-11-05', '2026-11-06', '2026-11-04T22:00:00.000Z'],
    // Weekend crossing daylight-saving transitions.
    ['2026-10-30T21:00:00Z', '2026-11-03', '2026-11-04', '2026-11-02T22:00:00.000Z'],
    ['2026-03-06T22:00:00Z', '2026-03-10', '2026-03-11', '2026-03-09T21:00:00.000Z'],
  ])('%s ships %s and arrives %s', (now, ship, delivery, cutoff) => {
    const result = getSpecialtyDeliveryEstimate(new Date(now));
    expect(result.shipDate.ymd).toBe(ship);
    expect(result.deliveryDate.ymd).toBe(delivery);
    expect(result.cutoffTime.toISOString()).toBe(cutoff);
    expect(result.remainingMs).toBeGreaterThan(0);
  });
  it('skips configured holidays for production, shipping and delivery', () => {
    const result = getSpecialtyDeliveryEstimate(new Date('2026-09-04T21:00:00Z'));
    expect(result.shipDate.ymd).toBe('2026-09-09');
    expect(result.deliveryDate.ymd).toBe('2026-09-10');
    expect(getSpecialtyDeliveryEstimate(new Date('2026-09-03T20:00:00Z')).deliveryDate.ymd).toBe('2026-09-08');
  });
});

describe('saved specialty and mixed orders', () => {
  it('uses placement time and ignores banner rush selections for specialty-only orders', () => {
    const order = {created_at:'2026-10-23T22:00:00Z', same_day_hit_service:true, saturday_delivery:true, items:[{product_type:'specialty'}]};
    expect(getOrderDeliveryEstimate(order)).toMatchObject({shipDate:'2026-10-27', deliveryDate:'2026-10-28'});
    expect(server.getOrderDeliveryEstimate(order)).toEqual(getOrderDeliveryEstimate(order));
    expect(renderOrderDeliveryEstimate(order)).toContain('Wednesday, Oct 28, 2026');
  });
  it('keeps Friday banner/yard sign/magnet dates and renders both schedules for mixed orders', () => {
    for (const product_type of ['banner','yard_sign','car_magnet']) {
      const order = {created_at:'2026-10-23T22:00:00Z',items:[{product_type},{product_type:'specialty'}]};
      const result = getOrderDeliveryEstimate(order);
      expect(result.shipments).toMatchObject([
        {shipDate:'2026-10-27', deliveryDate:'2026-10-28'},
        {shipDate:'2026-10-26', deliveryDate:'2026-10-27'},
      ]);
      expect(server.getOrderDeliveryEstimate(order)).toEqual(result);
      const email=renderOrderDeliveryEstimate(order);
      expect(email).toContain('Wednesday, Oct 28, 2026');
      expect(email).toContain('Tuesday, Oct 27, 2026');
      expect(email).toContain('Banners, yard signs &amp; car magnets');
    }
  });
});
