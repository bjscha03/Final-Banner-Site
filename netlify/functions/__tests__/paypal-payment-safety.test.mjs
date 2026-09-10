import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import safety from '../_shared/legacy/paypal-payment-safety.cjs';
import create from '../_shared/legacy/paypal-create-order.cjs';
import capture from '../_shared/legacy/paypal-capture-minimal.cjs';

describe('PayPal incident safety invariants', () => {
  const previous = process.env.FEATURE_PAYPAL;
  beforeEach(() => { process.env.FEATURE_PAYPAL = '0'; global.fetch = vi.fn(); });
  afterEach(() => { process.env.FEATURE_PAYPAL = previous; vi.restoreAllMocks(); });

  it('blocks order creation server-side when FEATURE_PAYPAL is not 1', async () => {
    const response = await create.handler({ httpMethod: 'POST', body: '{}' });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).error).toBe('PAYPAL_DISABLED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks capture server-side before PayPal when FEATURE_PAYPAL is not 1', async () => {
    const response = await capture.handler({ httpMethod: 'POST', body: JSON.stringify({ orderID: 'A', internalOrderId: '1' }) });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).error).toBe('PAYPAL_DISABLED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires exact internal identity, invoice, USD currency and authoritative amount', () => {
    const order = { id: '42', total_cents: 1250 };
    const paypal = { purchase_units: [{ custom_id: '42', invoice_id: 'BOTF-42', amount: { currency_code: 'USD', value: '12.50' } }] };
    expect(safety.matchesInternalOrder(paypal, order)).toBe(true);
    expect(safety.matchesInternalOrder({ ...paypal, purchase_units: [{ ...paypal.purchase_units[0], custom_id: '41' }] }, order)).toBe(false);
    expect(safety.matchesInternalOrder({ ...paypal, purchase_units: [{ ...paypal.purchase_units[0], amount: { currency_code: 'USD', value: '12.51' } }] }, order)).toBe(false);
  });

  it('recognizes only a COMPLETED capture as charged', () => {
    const data = { purchase_units: [{ payments: { captures: [{ id: 'PENDING', status: 'PENDING' }, { id: 'DONE', status: 'COMPLETED' }] } }] };
    expect(safety.captureFromOrder(data).id).toBe('DONE');
  });
});