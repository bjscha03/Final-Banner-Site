import { describe, expect, it } from 'vitest';
import { verifiedPaidOrderId } from './paymentSuccessGate';

describe('payment success canonical gate', () => {
  it('never treats a query-string order ID alone as proof of payment', () => {
    expect(verifiedPaidOrderId('query-order', {})).toBeNull();
    expect(verifiedPaidOrderId('query-order', {
      ok: true,
      order: { id: 'query-order', status: 'pending' },
    })).toBeNull();
  });

  it('requires the authorized canonical paid order to match the requested ID', () => {
    expect(verifiedPaidOrderId('query-order', {
      ok: true,
      order: { id: 'another-order', status: 'paid' },
    })).toBeNull();
    expect(verifiedPaidOrderId('query-order', {
      ok: true,
      order: { id: 'query-order', status: 'PAID' },
    })).toBe('query-order');
  });
});
