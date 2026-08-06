import { trackFBPurchase, trackGoogleAdsPurchaseConversion, trackPurchase, type AnalyticsItem } from './analytics';
import { isCustomerTrackingAllowed } from './trackingPolicy';

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
  coupon?: string | null;
};

export type ProviderAttempt = { provider: 'ga4' | 'meta' | 'google_ads'; attempted: boolean; ok: boolean; status?: 'not_attempted' | 'queued' | 'attempted' | 'blocked' | 'configuration_missing' | 'error'; error?: string };
export type PurchaseTrackingResult = { tracked: boolean; duplicate: boolean; key?: string; attempts: ProviderAttempt[]; reason?: string };

const PAID_STATUSES = new Set(['paid', 'completed', 'complete', 'succeeded']);
const inFlight = new Set<string>();

const buildProviderTrackingKey = (key: string, provider: ProviderAttempt['provider']) => `${key}_${provider}`;

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.debug('[purchase-tracking]', ...args);
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

const hasStoredKey = (key: string) => {
  try {
    return Boolean(
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key))
      || (typeof localStorage !== 'undefined' && localStorage.getItem(key))
    );
  } catch (_e) {
    return false;
  }
};

const setStoredKey = (key: string) => {
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

const attempt = (provider: ProviderAttempt['provider'], fn: () => boolean): ProviderAttempt => {
  try {
    const queued = fn();
    if (!queued) return { provider, attempted: false, ok: false, status: 'blocked' };
    return { provider, attempted: true, ok: true, status: 'queued' };
  } catch (error: unknown) {
    return {
      provider,
      attempted: true,
      ok: false,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const attemptPurchaseTracking = async (order: PurchaseTrackingOrder): Promise<PurchaseTrackingResult> => {
  const key = buildPurchaseTrackingKey(order.orderId);
  const transactionId = getPurchaseTransactionId(order);
  if (!key || !transactionId) return { tracked: false, duplicate: false, attempts: [], reason: 'missing_order_id' };
  if (!isPaidPurchaseOrder(order)) return { tracked: false, duplicate: false, attempts: [], reason: 'order_not_paid' };
  if (!Number.isFinite(order.totalCents) || order.totalCents <= 0) return { tracked: false, duplicate: false, attempts: [], reason: 'invalid_total' };
  if (!order.items.length) return { tracked: false, duplicate: false, attempts: [], reason: 'missing_items' };
  if (!isCustomerTrackingAllowed()) return { tracked: false, duplicate: false, attempts: [], reason: 'tracking_not_allowed' };

  const ga4Key = buildProviderTrackingKey(key, 'ga4');
  const metaKey = buildProviderTrackingKey(key, 'meta');
  const googleAdsKey = buildProviderTrackingKey(key, 'google_ads');
  const googleAdsMissingConfigKey = `${googleAdsKey}_configuration_missing`;
  const conversionId = import.meta.env.VITE_GOOGLE_ADS_CONVERSION_ID;
  const purchaseLabel = import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL;
  const hasGoogleAdsConfig = Boolean(conversionId && purchaseLabel);
  const alreadyTracked = hasStoredKey(key);

  if (inFlight.has(key)) return { tracked: false, duplicate: true, key, attempts: [] };
  if (alreadyTracked && (!hasGoogleAdsConfig || hasStoredKey(googleAdsKey) || !hasStoredKey(googleAdsMissingConfigKey))) {
    return { tracked: false, duplicate: true, key, attempts: [] };
  }

  inFlight.add(key);
  const attempts: ProviderAttempt[] = [];
  try {
    if (!alreadyTracked && !hasStoredKey(ga4Key)) {
      const ga4Attempt = attempt('ga4', () => trackPurchase({
        transaction_id: transactionId,
        value: order.totalCents,
        tax: order.taxCents || 0,
        shipping: order.shippingCents || 0,
        items: order.items,
        coupon: order.coupon || null,
      }));
      attempts.push(ga4Attempt);
      if (ga4Attempt.ok) setStoredKey(ga4Key);
    } else {
      attempts.push({ provider: 'ga4', attempted: false, ok: true, status: 'blocked' });
    }

    if (!alreadyTracked && !hasStoredKey(metaKey)) {
      const metaAttempt = attempt('meta', () => trackFBPurchase({ value: order.totalCents, transaction_id: transactionId }));
      attempts.push(metaAttempt);
      if (metaAttempt.ok) setStoredKey(metaKey);
    } else {
      attempts.push({ provider: 'meta', attempted: false, ok: true, status: 'blocked' });
    }

    if (!hasGoogleAdsConfig) {
      attempts.push({
        provider: 'google_ads',
        attempted: false,
        ok: false,
        status: 'configuration_missing',
        error: 'missing_google_ads_conversion_configuration',
      });
      setStoredKey(googleAdsMissingConfigKey);
    } else if (hasStoredKey(googleAdsKey)) {
      attempts.push({ provider: 'google_ads', attempted: false, ok: true, status: 'blocked' });
    } else {
      const googleAdsAttempt = attempt('google_ads', () => trackGoogleAdsPurchaseConversion({
        transaction_id: transactionId,
        value: order.totalCents,
        currency: 'USD',
      }));
      if (googleAdsAttempt.ok) {
        setStoredKey(googleAdsKey);
      }
      attempts.push(googleAdsAttempt);
    }

    const ga4Attempt = attempts.find((a) => a.provider === 'ga4');
    const metaAttempt = attempts.find((a) => a.provider === 'meta');
    if (ga4Attempt?.ok || metaAttempt?.ok) setStoredKey(key);

    await recordPurchaseAudit(order, attempts);
    devLog('attempted', { key, attempts });
    return { tracked: attempts.some((a) => a.attempted && a.ok), duplicate: alreadyTracked, key, attempts };
  } finally {
    inFlight.delete(key);
  }
};
