import { describe, expect, it } from 'vitest';
import { summarizeAdminOrders } from '../admin-order-overview';
import type { Order } from '../orders/types';

const order = (status: Order['status'], totalCents: number, extra: Partial<Order> = {}): Order => ({
  id: `order-${status}-${totalCents}`,
  user_id: null,
  status,
  subtotal_cents: totalCents,
  tax_cents: 0,
  total_cents: totalCents,
  currency: 'usd',
  created_at: '2026-08-27T00:00:00.000Z',
  items: [],
  ...extra,
});

describe('admin order overview', () => {
  it('separates refunded orders from active workflow counts and revenue', () => {
    const summary = summarizeAdminOrders([
      order('paid', 4_579),
      order('in_production', 10_000),
      order('shipped', 20_000, { tracking_number: 'TRACK-1' }),
      order('refunded', 4_579, { tracking_number: 'TRACK-OLD' }),
    ]);

    expect(summary).toEqual({
      totalOrders: 4,
      inProductionOrders: 1,
      shippedOrders: 1,
      pendingOrders: 1,
      refundedOrders: 1,
      totalRevenueCents: 34_579,
      refundedRevenueCents: 4_579,
    });
  });

  it('does not count test-order value in revenue or refund totals', () => {
    const summary = summarizeAdminOrders([
      order('paid', 9_999, { is_test_order: true }),
      order('refunded', 8_888, { is_test_order: true }),
    ]);

    expect(summary.totalOrders).toBe(2);
    expect(summary.pendingOrders).toBe(1);
    expect(summary.refundedOrders).toBe(0);
    expect(summary.totalRevenueCents).toBe(0);
    expect(summary.refundedRevenueCents).toBe(0);
  });
});
