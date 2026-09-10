import type { Order } from './orders/types';

export type AdminOrderOverview = {
  totalOrders: number;
  inProductionOrders: number;
  shippedOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  totalRevenueCents: number;
  refundedRevenueCents: number;
};

const normalizeStatus = (status: unknown): string => String(status || '').trim().toLowerCase();

export const isRefundedOrder = (order: Pick<Order, 'status'>): boolean => (
  normalizeStatus(order.status) === 'refunded'
);

const isTestOrder = (order: Pick<Order, 'is_test_order'>): boolean => order.is_test_order === true;
const REVENUE_STATUSES = new Set(['paid', 'in_production', 'shipped', 'delivered', 'fulfilled']);

export const summarizeAdminOrders = (orders: Order[]): AdminOrderOverview => {
  return orders.reduce<AdminOrderOverview>((summary, order) => {
    const status = normalizeStatus(order.status);
    const refunded = status === 'refunded';
    const shipped = !refunded && (
      Boolean(order.tracking_number)
      || ['shipped', 'delivered', 'fulfilled'].includes(status)
    );
    const totalCents = Number.isFinite(Number(order.total_cents)) ? Number(order.total_cents) : 0;

    summary.totalOrders += 1;

    if (refunded) {
      if (!isTestOrder(order)) {
        summary.refundedOrders += 1;
        summary.refundedRevenueCents += totalCents;
      }
      return summary;
    }

    if (status === 'in_production') summary.inProductionOrders += 1;
    if (shipped) summary.shippedOrders += 1;
    if (!shipped && status !== 'in_production') summary.pendingOrders += 1;

    if (!isTestOrder(order) && REVENUE_STATUSES.has(status)) summary.totalRevenueCents += totalCents;
    return summary;
  }, {
    totalOrders: 0,
    inProductionOrders: 0,
    shippedOrders: 0,
    pendingOrders: 0,
    refundedOrders: 0,
    totalRevenueCents: 0,
    refundedRevenueCents: 0,
  });
};
