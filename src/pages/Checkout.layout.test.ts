import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const checkout = readFileSync(fileURLToPath(new URL('./Checkout.tsx', import.meta.url)), 'utf8');

describe('checkout information hierarchy', () => {
  it('shows exactly one slim delivery timer before the checkout columns', () => {
    const timerMatches = checkout.match(/<DeliveryTimer/g) || [];
    const timerIndex = checkout.indexOf('<DeliveryTimer');
    const gridIndex = checkout.indexOf('grid grid-cols-1 lg:grid-cols-3');

    expect(timerMatches).toHaveLength(1);
    expect(checkout).toContain('variant="slim"');
    expect(timerIndex).toBeGreaterThan(-1);
    expect(timerIndex).toBeLessThan(gridIndex);
  });

  it('keeps one complete order total in Order Summary without per-item price duplication', () => {
    const totalsMatches = checkout.match(/<CheckoutOrderTotals/g) || [];
    const summaryIndex = checkout.indexOf('id="checkout-order-summary"');
    const totalsIndex = checkout.indexOf('<CheckoutOrderTotals');
    const paymentIndex = checkout.indexOf('{/* Payment */}');

    expect(totalsMatches).toHaveLength(1);
    expect(totalsIndex).toBeGreaterThan(summaryIndex);
    expect(totalsIndex).toBeLessThan(paymentIndex);
    expect(checkout).not.toContain('<CartItemBreakdown');
    expect(checkout).not.toContain('Adjusted subtotal</span>');
  });
});
