import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const checkout = readFileSync(fileURLToPath(new URL('./Checkout.tsx', import.meta.url)), 'utf8');

describe('checkout information hierarchy', () => {
  it('places the delivery estimate with order totals instead of a separate timer', () => {
    const totals = checkout.slice(checkout.indexOf('const orderTotals ='), checkout.indexOf('const orderReviewContent ='));
    expect(totals).toContain('<PriceDeliveryEstimate');
    expect(totals).toContain('<CheckoutOrderTotals');
    expect(checkout).not.toContain('<DeliveryTimer');
  });

  it('keeps one complete order total in Order Summary without per-item price duplication', () => {
    const totalsMatches = checkout.match(/<CheckoutOrderTotals/g) || [];
    const summaryIndex = checkout.indexOf('const orderTotalsProps');
    const totalsIndex = checkout.indexOf('<CheckoutOrderTotals');
    const paymentIndex = checkout.indexOf('{/* Payment */}');

    expect(totalsMatches).toHaveLength(1);
    expect(totalsIndex).toBeGreaterThan(summaryIndex);
    expect(totalsIndex).toBeLessThan(paymentIndex);
    expect(checkout).not.toContain('<CartItemBreakdown');
    expect(checkout).not.toContain('Adjusted subtotal</span>');
  });

  it('keeps recovery completeness failures visible after the transient toast', () => {
    const alertMatches = checkout.match(/role="alert"/g) || [];

    expect(checkout).toContain('setCartRecoveryError(outcome.message)');
    expect(checkout).toContain("cartRecoveryError ? 'Cart could not be restored' : 'Your cart is empty'");
    expect(checkout).toContain("'You can start a new design below.'");
    expect(alertMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a retryable fragment recovery actionable after history is scrubbed', () => {
    expect(checkout).toContain('prepareAbandonedCartRecoveryToken()');
    expect(checkout).toContain("outcome.status === 'unavailable'");
    expect(checkout).toContain("finishStartupCartRecovery(recoveryRevision, 'retryable')");
    expect(checkout).toContain('Retry cart recovery');
    expect(checkout).toContain('isAbandonedCartRecoveryTokenRetryable');
  });
});
