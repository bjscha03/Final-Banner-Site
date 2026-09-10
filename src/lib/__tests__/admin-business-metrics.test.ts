import { describe, expect, it } from 'vitest';
import {
  filterOrdersByAdminPeriod,
  getAdminOrderPeriodBounds,
  normalizeAdminCustomerEmail,
  resolveAdminCustomerEmail,
  summarizeAdminBusinessMetrics,
} from '../admin-business-metrics';
import type { Order } from '../orders/types';

const order = (id: string, createdAt: string, status: Order['status'], totalCents: number, email?: string, extra: Partial<Order> = {}): Order => ({
  id,
  user_id: null,
  email,
  status,
  subtotal_cents: totalCents,
  tax_cents: 0,
  total_cents: totalCents,
  currency: 'usd',
  created_at: createdAt,
  items: [],
  ...extra,
});

describe('admin business metrics', () => {
  it('uses local calendar-month boundaries and inclusive custom end dates', () => {
    const now = new Date(2026, 8, 15, 12);
    const month = getAdminOrderPeriodBounds('this_month', {}, now);
    expect(month.start).toEqual(new Date(2026, 8, 1));
    expect(month.endExclusive).toEqual(new Date(2026, 9, 1));

    const orders = [
      order('before', new Date(2026, 7, 31, 23, 59).toISOString(), 'paid', 100),
      order('start', new Date(2026, 8, 1, 0, 0).toISOString(), 'paid', 200),
      order('end', new Date(2026, 8, 30, 23, 59).toISOString(), 'paid', 300),
    ];
    expect(filterOrdersByAdminPeriod(orders, 'custom', { startDate: '2026-09-01', endDate: '2026-09-30' }).map(({ id }) => id)).toEqual(['start', 'end']);
  });

  it('converts local custom dates to exact UTC half-open bounds across DST', () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const bounds = getAdminOrderPeriodBounds('custom', {
        startDate: '2026-03-08',
        endDate: '2026-03-08',
      });
      expect(bounds.start?.toISOString()).toBe('2026-03-08T05:00:00.000Z');
      expect(bounds.endExclusive?.toISOString()).toBe('2026-03-09T04:00:00.000Z');
      expect(bounds.endExclusive!.getTime() - bounds.start!.getTime()).toBe(23 * 60 * 60 * 1000);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it('counts refunded rows in gross and recorded refunds, then removes them from net', () => {
    const allOrders = [
      order('paid-1', '2026-09-01T12:00:00.000Z', 'paid', 10_000, 'New@Customer-Business.com'),
      order('refunded-1', '2026-09-02T12:00:00.000Z', 'refunded', 4_000, 'repeat@customer-business.com'),
      order('older-repeat', '2026-08-01T12:00:00.000Z', 'shipped', 6_000, 'REPEAT@customer-business.com'),
      order('repeat-paid', '2026-09-04T12:00:00.000Z', 'paid', 2_000, 'repeat@customer-business.com'),
      order('pending', '2026-09-03T12:00:00.000Z', 'pending', 50_000, 'pending@customer-business.com'),
      order('test', '2026-09-03T12:00:00.000Z', 'paid', 90_000, 'test@customer-business.com', { is_test_order: true }),
    ];
    const periodOrders = allOrders.filter(({ id }) => id !== 'older-repeat');

    expect(summarizeAdminBusinessMetrics(allOrders, periodOrders)).toEqual({
      totalOrders: 2,
      grossSalesCents: 16_000,
      averageOrderValueCents: 6_000,
      recordedRefundsCents: 4_000,
      netSalesCents: 12_000,
      newCustomers: 1,
      repeatCustomers: 1,
      repeatRate: 0.5,
      identifiedCustomers: 2,
    });
  });

  it('does not use future orders to label an earlier period as repeat', () => {
    const first = order('first', '2026-08-10T12:00:00.000Z', 'paid', 1_000, 'buyer@customer-business.com');
    const future = order('future', '2026-09-10T12:00:00.000Z', 'shipped', 2_000, 'buyer@customer-business.com');

    expect(summarizeAdminBusinessMetrics([first, future], [first])).toMatchObject({
      newCustomers: 1,
      repeatCustomers: 0,
      repeatRate: 0,
    });
    expect(summarizeAdminBusinessMetrics([first, future], [first, future])).toMatchObject({
      newCustomers: 1,
      repeatCustomers: 1,
      repeatRate: 1,
    });
  });

  it('treats delivered and fulfilled historical rows as successful business orders', () => {
    const orders = [
      order('delivered', '2026-09-05T12:00:00.000Z', 'delivered', 4_000, 'one@business.com'),
      order('fulfilled', '2026-09-06T12:00:00.000Z', 'fulfilled', 6_000, 'two@business.com'),
    ];

    expect(summarizeAdminBusinessMetrics(orders, orders)).toMatchObject({
      totalOrders: 2,
      grossSalesCents: 10_000,
      netSalesCents: 10_000,
      averageOrderValueCents: 5_000,
      newCustomers: 2,
    });
  });

  it('uses verified profile identity for legacy signed-in orders with no order email', () => {
    const allOrders = [
      order('legacy-first', '2026-08-10T12:00:00.000Z', 'paid', 1_000, undefined, {
        user_id: 'profile-repeat',
        reporting_customer_email: ' LEGACY-REPEAT@BUSINESS.COM ',
      }),
      order('legacy-repeat', '2026-09-10T12:00:00.000Z', 'shipped', 2_000, undefined, {
        user_id: 'profile-repeat',
        reporting_customer_email: 'legacy-repeat@business.com',
      }),
      order('legacy-new', '2026-09-12T12:00:00.000Z', 'paid', 3_000, undefined, {
        user_id: 'profile-new',
        reporting_customer_email: 'legacy-new@business.com',
      }),
    ];
    const periodOrders = allOrders.filter(({ id }) => id !== 'legacy-first');

    expect(summarizeAdminBusinessMetrics(allOrders, periodOrders)).toMatchObject({
      totalOrders: 2,
      newCustomers: 1,
      repeatCustomers: 1,
      repeatRate: 0.5,
      identifiedCustomers: 2,
    });
  });

  it('normalizes real customer identity and excludes generated placeholders', () => {
    expect(normalizeAdminCustomerEmail(' Buyer@Real-Business.com ')).toBe('buyer@real-business.com');
    expect(normalizeAdminCustomerEmail('guest@example.com')).toBeNull();
    expect(normalizeAdminCustomerEmail('buyer@example.org')).toBeNull();
    expect(normalizeAdminCustomerEmail('buyer@test.com')).toBeNull();
    expect(normalizeAdminCustomerEmail('unknown@real-business.com')).toBeNull();
    expect(normalizeAdminCustomerEmail('guest-123@bannersonthefly.com')).toBeNull();
    expect(normalizeAdminCustomerEmail('preview-123@bannersonthefly.com')).toBeNull();
    expect(normalizeAdminCustomerEmail('test+checkout@bannersonthefly.com')).toBeNull();
    expect(normalizeAdminCustomerEmail('admin-preview-test@bannersonthefly.local')).toBeNull();
    expect(normalizeAdminCustomerEmail('not-an-email')).toBeNull();
    expect(resolveAdminCustomerEmail({
      email: 'Order@Business.com',
      reporting_customer_email: 'profile@business.com',
    })).toBe('order@business.com');
    expect(resolveAdminCustomerEmail({
      email: undefined,
      reporting_customer_email: ' PROFILE@BUSINESS.COM ',
    })).toBe('profile@business.com');
  });
});
