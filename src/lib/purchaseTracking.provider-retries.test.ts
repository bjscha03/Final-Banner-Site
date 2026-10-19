import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptPurchaseTracking, type PurchaseTrackingOrder } from './purchaseTracking';

const providers = vi.hoisted(() => ({
  ga4: vi.fn(),
  meta: vi.fn(),
  ads: vi.fn(),
  allowed: vi.fn(),
}));

vi.mock('./analytics', () => ({
  trackPurchase: providers.ga4,
  trackFBPurchase: providers.meta,
  trackGoogleAdsPurchaseConversion: providers.ads,
}));
vi.mock('./trackingPolicy', () => ({ isCustomerTrackingAllowed: providers.allowed }));

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
};

const order: PurchaseTrackingOrder = {
  orderId: 'retry-order',
  orderNumber: 'TEST-RETRY-1',
  status: 'paid',
  totalCents: 1000,
  pageUrl: 'https://example.invalid/payment-success',
  items: [{ item_id: 'banner', item_name: 'Banner', price: 1000, quantity: 1 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  providers.ga4.mockReturnValue(true);
  providers.meta.mockReturnValue(true);
  providers.ads.mockReturnValue(true);
  providers.allowed.mockReturnValue(true);
  vi.stubGlobal('localStorage', createStorage());
  vi.stubGlobal('sessionStorage', createStorage());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', 'AW-TEST');
  vi.stubEnv('VITE_GOOGLE_ADS_PURCHASE_LABEL', 'test-purchase');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('independent purchase-provider retries', () => {
  it.each(['ga4', 'meta'] as const)('retries %s after an exception without replaying other providers', async (provider) => {
    providers[provider].mockImplementationOnce(() => { throw new Error('temporary failure'); });
    const first = await attemptPurchaseTracking(order);
    expect(first.attempts.find((attempt) => attempt.provider === provider)?.ok).toBe(false);

    const retry = await attemptPurchaseTracking(order);
    expect(retry.attempts.find((attempt) => attempt.provider === provider)).toMatchObject({
      attempted: true, ok: true, status: 'queued',
    });
    expect(providers[provider]).toHaveBeenCalledTimes(2);
    expect(providers[provider === 'ga4' ? 'meta' : 'ga4']).toHaveBeenCalledTimes(1);
    expect(providers.ads).toHaveBeenCalledTimes(1);
  });

  it.each(['ga4', 'meta'] as const)('retries %s when its first event was not queued', async (provider) => {
    providers[provider].mockReturnValueOnce(false);
    await attemptPurchaseTracking(order);
    await attemptPurchaseTracking(order);
    expect(providers[provider]).toHaveBeenCalledTimes(2);
    expect(providers[provider === 'ga4' ? 'meta' : 'ga4']).toHaveBeenCalledTimes(1);
    expect(providers.ads).toHaveBeenCalledTimes(1);
  });

  it('retries failed GA4 even when direct Google Ads is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', '');
    vi.stubEnv('VITE_GOOGLE_ADS_PURCHASE_LABEL', '');
    providers.ga4.mockReturnValueOnce(false);
    await attemptPurchaseTracking(order);
    await attemptPurchaseTracking(order);
    expect(providers.ga4).toHaveBeenCalledTimes(2);
    expect(providers.meta).toHaveBeenCalledTimes(1);
    expect(providers.ads).not.toHaveBeenCalled();
  });

  it('retries both browser providers without replaying a successful Ads event', async () => {
    providers.ga4.mockReturnValueOnce(false);
    providers.meta.mockReturnValueOnce(false);
    await attemptPurchaseTracking(order);
    await attemptPurchaseTracking(order);
    expect(providers.ga4).toHaveBeenCalledTimes(2);
    expect(providers.meta).toHaveBeenCalledTimes(2);
    expect(providers.ads).toHaveBeenCalledTimes(1);
  });

  it('continues to retry failed Ads without replaying GA4 or Meta', async () => {
    providers.ads.mockImplementationOnce(() => { throw new Error('temporary Ads failure'); });
    await attemptPurchaseTracking(order);
    await attemptPurchaseTracking(order);
    expect(providers.ga4).toHaveBeenCalledTimes(1);
    expect(providers.meta).toHaveBeenCalledTimes(1);
    expect(providers.ads).toHaveBeenCalledTimes(2);
  });

  it('deduplicates all providers when all have already queued', async () => {
    await attemptPurchaseTracking(order);
    const repeated = await attemptPurchaseTracking(order);
    expect(repeated).toMatchObject({ tracked: false, duplicate: true });
    expect(providers.ga4).toHaveBeenCalledTimes(1);
    expect(providers.meta).toHaveBeenCalledTimes(1);
    expect(providers.ads).toHaveBeenCalledTimes(1);
  });

  it('preserves old aggregate-only dedupe and allows a new Ads configuration', async () => {
    localStorage.setItem('purchase_tracked_retry-order', '1');
    await attemptPurchaseTracking(order);
    expect(providers.ga4).not.toHaveBeenCalled();
    expect(providers.meta).not.toHaveBeenCalled();
    expect(providers.ads).toHaveBeenCalledTimes(1);
  });

  it('preserves old aggregate-only dedupe without an Ads configuration', async () => {
    localStorage.setItem('purchase_tracked_retry-order', '1');
    vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', '');
    const repeated = await attemptPurchaseTracking(order);
    expect(repeated).toMatchObject({ tracked: false, duplicate: true });
    expect(providers.ga4).not.toHaveBeenCalled();
    expect(providers.meta).not.toHaveBeenCalled();
    expect(providers.ads).not.toHaveBeenCalled();
  });

  it('still excludes test orders and non-paid orders', async () => {
    expect((await attemptPurchaseTracking({ ...order, isTestOrder: true })).reason).toBe('test_order');
    expect((await attemptPurchaseTracking({ ...order, status: 'pending' })).reason).toBe('order_not_paid');
    expect(providers.ga4).not.toHaveBeenCalled();
    expect(providers.meta).not.toHaveBeenCalled();
    expect(providers.ads).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not bypass the customer-tracking policy to retry', async () => {
    providers.allowed.mockReturnValue(false);
    expect((await attemptPurchaseTracking(order)).reason).toBe('tracking_not_allowed');
    expect(providers.ga4).not.toHaveBeenCalled();
    expect(providers.meta).not.toHaveBeenCalled();
    expect(providers.ads).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps two separate orders independent', async () => {
    await attemptPurchaseTracking(order);
    await attemptPurchaseTracking({ ...order, orderId: 'retry-order-2', orderNumber: 'TEST-RETRY-2' });
    expect(providers.ga4).toHaveBeenCalledTimes(2);
    expect(providers.meta).toHaveBeenCalledTimes(2);
    expect(providers.ads).toHaveBeenCalledTimes(2);
  });

  it('honors provider markers even if the aggregate marker is missing', async () => {
    await attemptPurchaseTracking(order);
    localStorage.removeItem('purchase_tracked_retry-order');
    sessionStorage.removeItem('purchase_tracked_retry-order');
    await attemptPurchaseTracking(order);
    expect(providers.ga4).toHaveBeenCalledTimes(1);
    expect(providers.meta).toHaveBeenCalledTimes(1);
    expect(providers.ads).toHaveBeenCalledTimes(1);
  });
});
