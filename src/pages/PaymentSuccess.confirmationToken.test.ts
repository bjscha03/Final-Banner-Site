import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./PaymentSuccess.tsx', import.meta.url)), 'utf8');

describe('PaymentSuccess confirmation credential recovery', () => {
  it('reads the order-scoped session credential and sends it header-only', () => {
    expect(source).toContain('readOrderConfirmationToken(orderId)');
    expect(source).toContain("'X-Order-Confirmation-Token': orderConfirmationToken");
    expect(source).toContain('removeOrderConfirmationToken(credentialOrderId)');
    expect(source).not.toMatch(/payment-success\?[^`]*confirmationToken/);
  });

  it('tracks purchase only after an exact canonical paid-order verification', () => {
    expect(source).toContain('verifiedPaidOrderId(orderId, data)');
    expect(source).toContain("if (confirmationState !== 'verified' || !canonicalOrderId || !loadedOrder) return");
    expect(source).toContain('attemptCanonicalPurchaseTracking(canonicalOrderId, loadedOrder');
  });

  it('keeps query-only and unauthorized orders out of the success presentation', () => {
    const gate = source.indexOf("if (confirmationState !== 'verified' || !loadedOrder || !verifiedOrderId)");
    const successHeading = source.indexOf('Payment Successful!');

    expect(gate).toBeGreaterThan(-1);
    expect(successHeading).toBeGreaterThan(gate);
    expect(source).toContain('No successful payment status has been assumed.');
    expect(source).not.toContain("orderId?.slice(-8)");
  });
});
