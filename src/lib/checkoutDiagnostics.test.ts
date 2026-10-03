import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackCheckoutDiagnostic } from './checkoutDiagnostics';
import { gtag } from './analytics';
import { sendClarity } from './trackingRuntime';

vi.mock('./analytics', () => ({ gtag: vi.fn() }));
vi.mock('./trackingRuntime', () => ({ sendClarity: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('checkout diagnostics', () => {
  it('sends field names and safe error codes without customer details', () => {
    trackCheckoutDiagnostic('validation_blocked', {
      provider: 'stripe', method: 'card', field: 'email',
      code: 'customer@example.com', email: 'customer@example.com', message: 'Jane at 123 Main',
    } as any);
    expect(gtag).toHaveBeenCalledWith('event', 'checkout_validation_blocked', {
      provider: 'stripe', method: 'card', field: 'email',
    });
    expect(sendClarity).toHaveBeenCalledWith('event', 'checkout_validation_email');
    expect(JSON.stringify([vi.mocked(gtag).mock.calls, vi.mocked(sendClarity).mock.calls])).not.toContain('customer@example.com');
  });

  it('keeps diagnostics independent and never blocks checkout if tracking throws', () => {
    vi.mocked(gtag).mockImplementation(() => { throw new Error('unavailable'); });
    expect(() => trackCheckoutDiagnostic('pay_clicked', { provider: 'stripe' })).not.toThrow();
    expect(sendClarity).toHaveBeenCalledWith('event', 'checkout_pay_clicked');
    vi.mocked(sendClarity).mockImplementation(() => { throw new Error('unavailable'); });
    expect(() => trackCheckoutDiagnostic('payment_succeeded', { provider: 'paypal' })).not.toThrow();
  });
});
