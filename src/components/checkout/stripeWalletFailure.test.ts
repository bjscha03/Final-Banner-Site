import { describe, expect, it, vi } from 'vitest';
import { createWalletFailureHandler } from './stripeWalletFailure';
import { runInNewContext } from 'node:vm';

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
  it('handles the known lifecycle error from the Stripe frame', () => {
    const error = runInNewContext("new Error('Unexpected call to paymentFailed(). Native sheet already closed.')");
    expect(error instanceof Error).toBe(false);
    const fail = createWalletFailureHandler({ paymentFailed() { throw error; } });
    expect(() => fail(failure)).not.toThrow();
  });
  it('does not hide unrelated errors from another frame', () => {
    const error = runInNewContext("new Error('Provider integration failed')");
    const fail = createWalletFailureHandler({ paymentFailed() { throw error; } });
    expect(() => fail(failure)).toThrow('Provider integration failed');
  });
});
