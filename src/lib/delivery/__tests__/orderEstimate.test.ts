import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { getOrderDeliveryEstimate, CARRIER_DELIVERY_NOTE } from '../orderEstimate';

const require = createRequire(import.meta.url);
const server = require('../../../../netlify/functions/_shared/delivery/orderEstimate.cjs');
const { renderOrderDeliveryEstimate } = require('../../../../netlify/functions/_shared/order-delivery-email.cjs');

describe('saved-order delivery estimates', () => {
  it.each([
    [{ created_at: '2026-10-15T14:00:00Z' }, '2026-10-16', '2026-10-19'],
    [{ created_at: '2026-10-16T02:00:00Z' }, '2026-10-19', '2026-10-20'],
    [{ created_at: '2026-10-16T16:59:00Z', same_day_hit_service: true }, '2026-10-16', '2026-10-19'],
    [{ created_at: '2026-10-16T16:59:00Z', same_day_hit_service: true, saturday_delivery: true }, '2026-10-16', '2026-10-17'],
    [{ created_at: '2026-10-16T17:00:00Z', same_day_hit_service: true }, '2026-10-19', '2026-10-20'],
  ])('matches the storefront rules and server email for %j', (order, shipDate, deliveryDate) => {
    const result = getOrderDeliveryEstimate(order);
    expect(result).toMatchObject({ shipDate, deliveryDate });
    expect(server.getOrderDeliveryEstimate(order)).toEqual(result);
    expect(renderOrderDeliveryEstimate(order)).toContain(result.deliveryLabel);
  });

  it('keeps the original estimate when viewed or emailed later', () => {
    const order = { created_at: '2026-10-15T14:00:00Z' };
    const original = getOrderDeliveryEstimate(order);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2027-04-02T22:00:00Z'));
      expect(getOrderDeliveryEstimate(order)).toEqual(original);
      expect(renderOrderDeliveryEstimate(order)).toContain('Monday, Oct 19, 2026');
    } finally { vi.useRealTimers(); }
  });

  it('does not invent a date when placement time is absent, and explains design approval', () => {
    expect(getOrderDeliveryEstimate({}).deliveryDate).toBeNull();
    expect(getOrderDeliveryEstimate({ created_at: 'invalid' }).deliveryDate).toBeNull();
    expect(getOrderDeliveryEstimate({ created_at: '2026-10-15T14:00:00Z', items: [{ design_service_enabled: true }] }).note).toMatch(/Design approval/);
    expect(renderOrderDeliveryEstimate({})).toContain('We will confirm your delivery estimate');
    expect(renderOrderDeliveryEstimate({})).toContain(CARRIER_DELIVERY_NOTE);
  });
});
