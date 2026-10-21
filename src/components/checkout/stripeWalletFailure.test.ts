import { describe, expect, it, vi } from 'vitest';
import { createWalletFailureHandler } from './stripeWalletFailure';

describe('wallet failure lifecycle', () => {
  const failure = { reason: 'fail' as const, message: 'Payment could not be started.' };
  it('completes each confirm event only once', () => {
    const paymentFailed = vi.fn();
    const fail = createWalletFailureHandler({ paymentFailed });
    fail(failure); fail(failure);
    expect(paymentFailed).toHaveBeenCalledExactlyOnceWith(failure);
  });
  it('keeps a closed native sheet from producing a second page error', () => {
    const fail = createWalletFailureHandler({ paymentFailed() {
      throw new Error('Unexpected call to paymentFailed(). Ensure you are either submitting a payment or calling paymentFailed() once per expressCheckout Element confirm event.');
    } });
    expect(() => fail(failure)).not.toThrow();
  });
  it('does not hide unrelated integration errors', () => {
    const fail = createWalletFailureHandler({ paymentFailed() { throw new Error('Other integration error'); } });
    expect(() => fail(failure)).toThrow('Other integration error');
  });
});
