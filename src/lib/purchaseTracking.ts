import { trackFBPurchase, trackGoogleAdsPurchaseConversion, trackPurchase, type AnalyticsItem } from './analytics';

export type PurchaseTrackingOrder = {
  orderId: string | null | undefined;
  orderNumber?: string | null;
  status?: string | null;
  totalCents: number;
  taxCents?: number;
  shippingCents?: number;
  items: AnalyticsItem[];
  pageUrl?: string;
  paypalOrderId?: string | null;
  paypalCaptureId?: string | null;
};

export type ProviderAttempt = { provider: 'ga4' | 'meta' | 'google_ads'; attempted: boolean; ok: boolean; status?: 'not_attempted' | 'queued' | 'attempted' | 'blocked' | 'configuration_missing' | 'error'; error?: string };
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
        paypal_order_id: order.paypalOrderId || null,
        paypal_capture_id: order.paypalCaptureId || null,
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
    return { provider, attempted: true, ok: true, status: 'attempted' };
  } catch (error: any) {
    return { provider, attempted: true, ok: false, status: 'error', error: error?.message || String(error) };
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
    const conversionId = (import.meta as any)?.env?.VITE_GOOGLE_ADS_CONVERSION_ID;
    const purchaseLabel = (import.meta as any)?.env?.VITE_GOOGLE_ADS_PURCHASE_LABEL;
    if (!conversionId || !purchaseLabel) {
      attempts.push({
        provider: 'google_ads',
        attempted: false,
        ok: false,
        status: 'configuration_missing',
        error: 'missing_google_ads_conversion_configuration',
      });
    } else {
      const hadGtag = typeof window !== 'undefined' && typeof (window as any).gtag === 'function';
      attempts.push(attempt('google_ads', () => trackGoogleAdsPurchaseConversion({
        transaction_id: transactionId,
        value: order.totalCents,
        currency: 'USD',
      })));
      const googleAdsAttempt = attempts[attempts.length - 1];
      if (googleAdsAttempt.ok) googleAdsAttempt.status = hadGtag ? 'attempted' : 'queued';
    }
    await recordPurchaseAudit(order, attempts);
    const googleAdsAttempt = attempts.find((a) => a.provider === 'google_ads');
    if (googleAdsAttempt?.attempted && googleAdsAttempt.ok) setStored(key);
    devLog('attempted', { key, attempts });
    return { tracked: Boolean(attempts.find((a) => a.provider === 'google_ads')?.ok), duplicate: false, key, attempts };
  } finally {
    inFlight.delete(key);
  }
};
