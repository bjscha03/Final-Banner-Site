import type { Order } from './orders/types';

export type AdminOrderPeriod = 'this_month' | 'last_month' | 'custom' | 'all_time';

export type AdminOrderDateRange = {
  startDate?: string;
  endDate?: string;
};

export type AdminBusinessMetrics = {
  totalOrders: number;
  grossSalesCents: number;
  averageOrderValueCents: number;
  recordedRefundsCents: number;
  netSalesCents: number;
  newCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  identifiedCustomers: number;
};

const SUCCESSFUL_STATUSES = new Set(['paid', 'in_production', 'shipped', 'delivered', 'fulfilled']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYNTHETIC_LOCAL_PARTS = new Set([
  'customer',
  'guest',
  'guestcustomer',
  'noemail',
  'none',
  'noreply',
  'preview',
  'test',
  'unknown',
]);
const SYNTHETIC_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.test',
  'invalid',
  'localhost',
  'test.com',
]);

const normalizeStatus = (status: unknown): string => String(status || '').trim().toLowerCase();

export const isReportableOrder = (order: Pick<Order, 'status' | 'is_test_order'>): boolean => (
  order.is_test_order !== true && (SUCCESSFUL_STATUSES.has(normalizeStatus(order.status)) || normalizeStatus(order.status) === 'refunded')
);

export const isSuccessfulAdminOrder = (order: Pick<Order, 'status' | 'is_test_order'>): boolean => (
  order.is_test_order !== true && SUCCESSFUL_STATUSES.has(normalizeStatus(order.status))
);

export const normalizeAdminCustomerEmail = (value: unknown): string | null => {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  const splitAt = email.lastIndexOf('@');
  const local = email.slice(0, splitAt);
  const domain = email.slice(splitAt + 1);
  if (SYNTHETIC_LOCAL_PARTS.has(local) || SYNTHETIC_DOMAINS.has(domain)) return null;
  if (/\.(invalid|local|test)$/.test(domain)) return null;
  if (/^(guest|preview|test)[-_+]/.test(local) && domain === 'bannersonthefly.com') return null;
  return email;
};

export const resolveAdminCustomerEmail = (
  order: Pick<Order, 'email' | 'reporting_customer_email'>,
): string | null => (
  normalizeAdminCustomerEmail(order.email)
  ?? normalizeAdminCustomerEmail(order.reporting_customer_email)
);

const parseLocalDate = (value: string | undefined): Date | null => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
};

export const getAdminOrderPeriodBounds = (
  period: AdminOrderPeriod,
  customRange: AdminOrderDateRange = {},
  now = new Date(),
): { start: Date | null; endExclusive: Date | null } => {
  if (period === 'all_time') return { start: null, endExclusive: null };

  if (period === 'custom') {
    const start = parseLocalDate(customRange.startDate);
    const end = parseLocalDate(customRange.endDate);
    if (!start || !end || end.getTime() < start.getTime()) return { start: null, endExclusive: null };
    const endExclusive = new Date(end);
    endExclusive.setDate(endExclusive.getDate() + 1);
    return { start, endExclusive };
  }

  if (period === 'last_month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      endExclusive: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    endExclusive: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
};

export const filterOrdersByAdminPeriod = (
  orders: Order[],
  period: AdminOrderPeriod,
  customRange: AdminOrderDateRange = {},
  now = new Date(),
): Order[] => {
  const { start, endExclusive } = getAdminOrderPeriodBounds(period, customRange, now);
  if (period === 'custom' && (!start || !endExclusive)) return [];
  if (!start || !endExclusive) return orders;

  const startTime = start.getTime();
  const endTime = endExclusive.getTime();
  return orders.filter((order) => {
    const createdAt = new Date(order.created_at).getTime();
    return Number.isFinite(createdAt) && createdAt >= startTime && createdAt < endTime;
  });
};

const safeTotalCents = (order: Pick<Order, 'total_cents'>): number => {
  const value = Number(order.total_cents);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
};

export const summarizeAdminBusinessMetrics = (
  allOrders: Order[],
  periodOrders: Order[],
): AdminBusinessMetrics => {
  const successfulLifetimeOrders = new Map<string, Order[]>();
  allOrders.filter(isSuccessfulAdminOrder).forEach((order) => {
    const email = resolveAdminCustomerEmail(order);
    if (!email) return;
    const customerOrders = successfulLifetimeOrders.get(email) || [];
    customerOrders.push(order);
    successfulLifetimeOrders.set(email, customerOrders);
  });
  successfulLifetimeOrders.forEach((orders) => {
    orders.sort((left, right) => {
      const timestampDifference = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      return timestampDifference || left.id.localeCompare(right.id);
    });
  });

  const periodReportableOrders = periodOrders.filter(isReportableOrder);
  const periodSuccessfulOrders = periodOrders.filter(isSuccessfulAdminOrder);
  const periodSuccessfulIds = new Set(periodSuccessfulOrders.map(({ id }) => id));
  const periodCustomers = new Set<string>();
  let grossSalesCents = 0;
  let recordedRefundsCents = 0;

  periodReportableOrders.forEach((order) => {
    const totalCents = safeTotalCents(order);
    grossSalesCents += totalCents;
    if (normalizeStatus(order.status) === 'refunded') recordedRefundsCents += totalCents;
  });

  periodSuccessfulOrders.forEach((order) => {
    const email = resolveAdminCustomerEmail(order);
    if (email) periodCustomers.add(email);
  });

  let newCustomers = 0;
  let repeatCustomers = 0;
  periodCustomers.forEach((email) => {
    const lifetimeOrders = successfulLifetimeOrders.get(email) || [];
    if (lifetimeOrders[0] && periodSuccessfulIds.has(lifetimeOrders[0].id)) newCustomers += 1;
    if (lifetimeOrders.some((order, index) => index > 0 && periodSuccessfulIds.has(order.id))) repeatCustomers += 1;
  });

  const identifiedCustomers = periodCustomers.size;
  const netSalesCents = grossSalesCents - recordedRefundsCents;
  return {
    totalOrders: periodSuccessfulOrders.length,
    grossSalesCents,
    averageOrderValueCents: periodSuccessfulOrders.length
      ? Math.round(netSalesCents / periodSuccessfulOrders.length)
      : 0,
    recordedRefundsCents,
    netSalesCents,
    newCustomers,
    repeatCustomers,
    repeatRate: identifiedCustomers ? repeatCustomers / identifiedCustomers : 0,
    identifiedCustomers,
  };
};

export const adminOrderPeriodLabel = (period: AdminOrderPeriod): string => ({
  this_month: 'This Month',
  last_month: 'Last Month',
  custom: 'Custom',
  all_time: 'All Time',
}[period]);
