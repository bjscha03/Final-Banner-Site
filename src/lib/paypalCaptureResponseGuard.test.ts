import { describe, expect, it } from 'vitest';
import { _test } from './paypalCaptureResponseGuard';

describe('PayPal capture response containment', () => {
  it('locks every server response that says payment may be captured or uncertain', () => {
    expect(_test.shouldForceDoNotRetryLock({ doNotRetry: true })).toBe(true);
    expect(_test.shouldForceDoNotRetryLock({ paymentStatusUnknown: true })).toBe(true);
    expect(_test.shouldForceDoNotRetryLock({ reconciliationRequired: true })).toBe(true);
    expect(_test.shouldForceDoNotRetryLock({ paymentCaptured: true })).toBe(true);
  });

  it('does not lock a normal pre-capture failure without payment evidence', () => {
    expect(_test.shouldForceDoNotRetryLock({ error: 'PAYPAL_DISABLED' })).toBe(false);
    expect(_test.shouldForceDoNotRetryLock({ error: 'INVALID_JSON' })).toBe(false);
  });
});
