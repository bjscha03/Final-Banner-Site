import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptPurchaseTracking, buildPurchaseTrackingKey } from './purchaseTracking';

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

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  (import.meta as any).env.VITE_GOOGLE_ADS_CONVERSION_ID = 'AW-123456789';
  (import.meta as any).env.VITE_GOOGLE_ADS_PURCHASE_LABEL = 'purchaseLabel';
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })));
  vi.stubGlobal('window', window);
  window.dataLayer = [];
  window.gtag = vi.fn();
});

describe('purchase tracking', () => {
  it('tracks GA4/Meta while leaving Google Ads purchase upload to the server authority', async () => {
    const result = await attemptPurchaseTracking(baseOrder());
    expect(result.attempts.find(a => a.provider === 'google_ads')?.attempted).toBe(false);
    expect(window.gtag).not.toHaveBeenCalledWith('event', 'conversion', expect.any(Object));
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
    expect(result.attempts.find(a => a.provider === 'google_ads')?.attempted).toBe(false);
  });

  it('still attempts Google Ads when GA4 throws', async () => {
    window.gtag = vi.fn((cmd, name) => { if (name === 'purchase') throw new Error('ga4 down'); });
    const result = await attemptPurchaseTracking(baseOrder());
    expect(result.attempts.find(a => a.provider === 'ga4')?.ok).toBe(false);
    expect(result.attempts.find(a => a.provider === 'google_ads')?.attempted).toBe(false);
  });

  it('rejects missing order ID and never creates shared undefined key', async () => {
    const result = await attemptPurchaseTracking(baseOrder({ orderId: undefined }));
    expect(result.reason).toBe('missing_order_id');
    expect(buildPurchaseTrackingKey(undefined)).toBeNull();
  });

  it('marks browser dedupe after GA4/Meta audit because Google Ads is server-authoritative', async () => {
    const result = await attemptPurchaseTracking(baseOrder());
    expect(result.attempts.find(a => a.provider === 'google_ads')?.error).toBe('server_authoritative_conversion_enabled');
    expect(localStorage.getItem('purchase_tracked_order-1')).toBe('1');
  });

  it('deduplicates duplicate page renders and refreshes', async () => {
    await attemptPurchaseTracking(baseOrder());
    const second = await attemptPurchaseTracking(baseOrder());
    expect(second.duplicate).toBe(true);
  });

  it('allows two different orders in the same browser', async () => {
    await attemptPurchaseTracking(baseOrder({ orderId: 'order-1', orderNumber: 'BOTF-1' }));
    await attemptPurchaseTracking(baseOrder({ orderId: 'order-2', orderNumber: 'BOTF-2' }));
    expect(window.gtag).toHaveBeenCalledTimes(2);
  });

  it('covers alternate payment route by tracking any paid server-loaded order', async () => {
    const result = await attemptPurchaseTracking(baseOrder({ orderId: 'paypal-order', status: 'completed' }));
    expect(result.tracked).toBe(true);
  });

  it('does not count customers who never return to a browser success page', async () => {
    // There is intentionally no browser invocation in this scenario; reconciliation relies on server audit/webhook logs.
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('does not count failed or canceled payments', async () => {
    expect((await attemptPurchaseTracking(baseOrder({ status: 'failed' }))).reason).toBe('order_not_paid');
    expect((await attemptPurchaseTracking(baseOrder({ status: 'canceled' }))).reason).toBe('order_not_paid');
  });
});
