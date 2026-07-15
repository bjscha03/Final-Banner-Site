import { trackFBPurchase, trackPurchase, type AnalyticsItem } from './analytics';

export type PurchaseTrackingOrder = {
  orderId: string | null | undefined;
  orderNumber?: string | null;
  status?: string | null;
  totalCents: number;
  taxCents?: number;
  shippingCents?: number;
  items: AnalyticsItem[];
  pageUrl?: string;
};

export type ProviderAttempt = { provider: 'ga4' | 'meta' | 'google_ads'; attempted: boolean; ok: boolean; error?: string };
export type PurchaseTrackingResult = { tracked: boolean; duplicate: boolean; key?: string; attempts: ProviderAttempt[]; reason?: string };

const PAID_STATUSES = new Set(['paid', 'completed', 'complete', 'succeeded']);
const inFlight = new Set<string>();

const devLog = (...args: any[]) => {
  if ((import.meta as any)?.env?.DEV) console.debug('[purchase-tracking]', ...args);
};

export const buildPurchaseTrackingKey = (orderId?: string | null) => {
  const normalized = String(orderId || '').trim();
  return normalized ? `purchase_tracked_${normalized}` : null;
};

export const getPurchaseTransactionId = (order: Pick<PurchaseTrackingOrder, 'orderId' | 'orderNumber'>) => {
  const orderNumber = String(order.orderNumber || '').trim();
  if (orderNumber) return orderNumber;
  return String(order.orderId || '').trim();
};

export const isPaidPurchaseOrder = (order: PurchaseTrackingOrder) => {
  const status = String(order.status || '').toLowerCase();
  return PAID_STATUSES.has(status);
};

const getStored = (key: string) => {
  try {
    return Boolean(
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key))
      || (typeof localStorage !== 'undefined' && localStorage.getItem(key))
    );
  } catch (_e) {
    return false;
  }
};

const setStored = (key: string) => {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, '1');
  } catch (_e) {
    // Provider transaction IDs still provide platform-side dedupe.
  }
};

const recordPurchaseAudit = async (order: PurchaseTrackingOrder, attempts: ProviderAttempt[]) => {
  try {
    await fetch('/.netlify/functions/record-purchase-analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        order_id: order.orderId,
        order_number: getPurchaseTransactionId(order),
        payment_status: order.status,
        order_total_cents: order.totalCents,
        currency: 'USD',
        page_url: order.pageUrl || (typeof window !== 'undefined' ? window.location.href : ''),
        attempts,
      }),
    });
  } catch (error) {
    devLog('audit logging failed', error);
  }
};

const attempt = (provider: ProviderAttempt['provider'], fn: () => void): ProviderAttempt => {
  try {
    fn();
    return { provider, attempted: true, ok: true };
  } catch (error: any) {
    return { provider, attempted: true, ok: false, error: error?.message || String(error) };
  }
};

export const attemptPurchaseTracking = async (order: PurchaseTrackingOrder): Promise<PurchaseTrackingResult> => {
  const key = buildPurchaseTrackingKey(order.orderId);
  const transactionId = getPurchaseTransactionId(order);
  if (!key || !transactionId) return { tracked: false, duplicate: false, attempts: [], reason: 'missing_order_id' };
  if (!isPaidPurchaseOrder(order)) return { tracked: false, duplicate: false, attempts: [], reason: 'order_not_paid' };
  if (!Number.isFinite(order.totalCents) || order.totalCents <= 0) return { tracked: false, duplicate: false, attempts: [], reason: 'invalid_total' };
  if (!order.items.length) return { tracked: false, duplicate: false, attempts: [], reason: 'missing_items' };
  if (getStored(key) || inFlight.has(key)) return { tracked: false, duplicate: true, key, attempts: [] };

  inFlight.add(key);
  const attempts: ProviderAttempt[] = [];
  try {
    attempts.push(attempt('ga4', () => trackPurchase({
      transaction_id: transactionId,
      value: order.totalCents,
      tax: order.taxCents || 0,
      shipping: order.shippingCents || 0,
      items: order.items,
    })));
    attempts.push(attempt('meta', () => trackFBPurchase({ value: order.totalCents, transaction_id: transactionId })));
    attempts.push({
      provider: 'google_ads',
      attempted: false,
      ok: false,
      error: 'server_authoritative_conversion_enabled',
    });
    await recordPurchaseAudit(order, attempts);
    setStored(key);
    devLog('attempted', { key, attempts });
    return { tracked: true, duplicate: false, key, attempts };
  } finally {
    inFlight.delete(key);
  }
};
