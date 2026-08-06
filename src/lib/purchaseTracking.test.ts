import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptPurchaseTracking, buildPurchaseTrackingKey } from './purchaseTracking';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value)),
    get length() { return values.size; },
  } as Storage;
};

const baseOrder = (overrides: any = {}) => ({
  orderId: 'order-1',
  orderNumber: 'BOTF-1001',
  status: 'paid',
  totalCents: 12345,
  taxCents: 600,
  shippingCents: 0,
  items: [{ item_id: 'item-1', item_name: 'Banner', item_category: 'Banner', price: 12345, quantity: 1 }],
  ...overrides,
});

const clearGoogleAdsConfig = () => {
  vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', '');
  vi.stubEnv('VITE_GOOGLE_ADS_PURCHASE_LABEL', '');
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubGlobal('localStorage', createStorage());
  vi.stubGlobal('sessionStorage', createStorage());
  vi.stubGlobal('window', {
    location: {
      hostname: 'bannersonthefly.com',
      pathname: '/payment-success',
      protocol: 'https:',
      href: 'https://bannersonthefly.com/payment-success',
    },
    navigator: { webdriver: false, userAgent: 'Mozilla/5.0 Chrome/130 Safari/537.36' },
    dataLayer: [],
  });
  vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', 'AW-123456789');
  vi.stubEnv('VITE_GOOGLE_ADS_PURCHASE_LABEL', 'purchaseLabel');
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })));
  window.dataLayer = [];
  window.gtag = vi.fn();
  (window as any).fbq = vi.fn();
});

describe('purchase tracking', () => {
  it('never sends purchase or conversion events for a test order', async () => {
    const result = await attemptPurchaseTracking(baseOrder({ isTestOrder: true }));

    expect(result).toMatchObject({ tracked: false, reason: 'test_order' });
    expect(window.gtag).not.toHaveBeenCalled();
    expect((window as any).fbq).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fires GA4 once when Google Ads env variables are missing', async () => {
    clearGoogleAdsConfig();

    await attemptPurchaseTracking(baseOrder());
    await attemptPurchaseTracking(baseOrder());

    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({ transaction_id: 'BOTF-1001' }));
    expect(localStorage.getItem('purchase_tracked_order-1')).toBe('1');
  });

  it('fires Meta once when Google Ads env variables are missing', async () => {
    clearGoogleAdsConfig();

    await attemptPurchaseTracking(baseOrder());
    await attemptPurchaseTracking(baseOrder());

    expect((window as any).fbq).toHaveBeenCalledTimes(1);
    expect((window as any).fbq).toHaveBeenCalledWith('track', 'Purchase', expect.objectContaining({
      value: 123.45,
      currency: 'USD',
      content_type: 'product',
    }), expect.objectContaining({ eventID: 'BOTF-1001' }));
  });

  it('does not resend GA4 or Meta on refresh or re-render when Google Ads configuration is missing', async () => {
    clearGoogleAdsConfig();

    const first = await attemptPurchaseTracking(baseOrder());
    const second = await attemptPurchaseTracking(baseOrder());

    expect(first.attempts.find((a) => a.provider === 'google_ads')?.status).toBe('configuration_missing');
    expect(second.duplicate).toBe(true);
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect((window as any).fbq).toHaveBeenCalledTimes(1);
  });

  it('tracks two separate orders when Google Ads configuration is missing', async () => {
    clearGoogleAdsConfig();

    await attemptPurchaseTracking(baseOrder({ orderId: 'order-1', orderNumber: 'BOTF-1' }));
    await attemptPurchaseTracking(baseOrder({ orderId: 'order-2', orderNumber: 'BOTF-2' }));

    expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({ transaction_id: 'BOTF-1' }));
    expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({ transaction_id: 'BOTF-2' }));
    expect((window as any).fbq).toHaveBeenCalledTimes(2);
  });

  it('does not call direct Google Ads conversion without configuration', async () => {
    clearGoogleAdsConfig();

    const result = await attemptPurchaseTracking(baseOrder());

    expect(result.attempts.find((a) => a.provider === 'google_ads')).toMatchObject({
      attempted: false,
      ok: false,
      status: 'configuration_missing',
    });
    expect(window.gtag).not.toHaveBeenCalledWith('event', 'conversion', expect.anything());
  });

  it('sends an existing configured direct Google Ads conversion once', async () => {
    await attemptPurchaseTracking(baseOrder());
    await attemptPurchaseTracking(baseOrder());

    expect(window.gtag).toHaveBeenCalledWith('event', 'conversion', expect.objectContaining({
      send_to: 'AW-123456789/purchaseLabel',
      value: 123.45,
      currency: 'USD',
      transaction_id: 'BOTF-1001',
    }));
    expect(window.gtag).toHaveBeenCalledTimes(2); // one GA4 purchase and one direct conversion
  });

  it('does not track failed or canceled payments', async () => {
    expect((await attemptPurchaseTracking(baseOrder({ status: 'failed' }))).reason).toBe('order_not_paid');
    expect((await attemptPurchaseTracking(baseOrder({ status: 'canceled' }))).reason).toBe('order_not_paid');
    expect(window.gtag).not.toHaveBeenCalled();
    expect((window as any).fbq).not.toHaveBeenCalled();
  });

  it('never queues a purchase or audit record from an admin route', async () => {
    window.location.pathname = '/admin/orders';

    const result = await attemptPurchaseTracking(baseOrder());

    expect(result.reason).toBe('tracking_not_allowed');
    expect(window.gtag).not.toHaveBeenCalled();
    expect((window as any).fbq).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('queues events when gtag loads late', async () => {
    window.gtag = undefined as any;
    await attemptPurchaseTracking(baseOrder());
    expect(window.dataLayer?.some((args: any) => args[0] === 'event' && args[1] === 'purchase')).toBe(true);
  });

  it('still attempts Google Ads when Meta throws', async () => {
    (window as any).fbq = vi.fn(() => { throw new Error('meta down'); });
    const result = await attemptPurchaseTracking(baseOrder());
    expect(result.attempts.find(a => a.provider === 'meta')?.ok).toBe(false);
    expect(result.attempts.find(a => a.provider === 'google_ads')?.attempted).toBe(true);
  });

  it('still attempts Google Ads when GA4 throws', async () => {
    window.gtag = vi.fn((cmd, name) => { if (name === 'purchase') throw new Error('ga4 down'); });
    const result = await attemptPurchaseTracking(baseOrder());
    expect(result.attempts.find(a => a.provider === 'ga4')?.ok).toBe(false);
    expect(result.attempts.find(a => a.provider === 'google_ads')?.attempted).toBe(true);
  });

  it('rejects missing order ID and never creates shared undefined key', async () => {
    const result = await attemptPurchaseTracking(baseOrder({ orderId: undefined }));
    expect(result.reason).toBe('missing_order_id');
    expect(buildPurchaseTrackingKey(undefined)).toBeNull();
  });

  it('can retry direct Google Ads later without resending GA4 or Meta', async () => {
    clearGoogleAdsConfig();
    await attemptPurchaseTracking(baseOrder());
    vi.stubEnv('VITE_GOOGLE_ADS_CONVERSION_ID', 'AW-123456789');
    vi.stubEnv('VITE_GOOGLE_ADS_PURCHASE_LABEL', 'purchaseLabel');

    const retry = await attemptPurchaseTracking(baseOrder());

    expect(retry.duplicate).toBe(true);
    expect(retry.attempts.find((a) => a.provider === 'ga4')).toMatchObject({ attempted: false, status: 'blocked' });
    expect(retry.attempts.find((a) => a.provider === 'meta')).toMatchObject({ attempted: false, status: 'blocked' });
    expect(retry.attempts.find((a) => a.provider === 'google_ads')?.attempted).toBe(true);
    expect(window.gtag).toHaveBeenCalledTimes(2); // original GA4 purchase plus later direct conversion
    expect((window as any).fbq).toHaveBeenCalledTimes(1);
  });
});
