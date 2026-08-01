import { describe, expect, it } from 'vitest';
import { _test } from './paypalCaptureResponseGuard';

describe('PayPal capture response containment', () => {
  it('locks server responses that say payment may be captured or uncertain', () => {
    expect(_test.shouldForceDoNotRetryLock({ doNotRetry: true })).toBe(true);
    expect(_test.shouldForceDoNotRetryLock({ paymentStatusUnknown: true })).toBe(true);
    expect(_test.shouldForceDoNotRetryLock({ reconciliationRequired: true })).toBe(true);
    expect(_test.shouldForceDoNotRetryLock({ paymentCaptured: true })).toBe(true);
  });

  it('does not lock a definitive completed capture that must reach success redirect', () => {
    const completed = {
      success: true,
      paymentCaptured: true,
      reconciliationRequired: false,
      status: 'COMPLETED',
      captureStatus: 'COMPLETED',
      captureID: 'CAPTURE-123',
    };

    expect(_test.isDefinitiveCompletedCapture(completed)).toBe(true);
    expect(_test.shouldForceDoNotRetryLock(completed)).toBe(false);
  });

  it('still locks completed-looking payloads when reconciliation is required', () => {
    expect(_test.shouldForceDoNotRetryLock({
      success: true,
      paymentCaptured: true,
      reconciliationRequired: true,
      status: 'COMPLETED',
      captureStatus: 'COMPLETED',
      captureID: 'CAPTURE-123',
    })).toBe(true);
  });

  it('does not lock a normal pre-capture failure without payment evidence', () => {
    expect(_test.shouldForceDoNotRetryLock({ error: 'PAYPAL_DISABLED' })).toBe(false);
    expect(_test.shouldForceDoNotRetryLock({ error: 'INVALID_JSON' })).toBe(false);
  });
});
