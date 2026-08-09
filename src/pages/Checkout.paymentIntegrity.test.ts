import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const checkout = readFileSync(fileURLToPath(new URL('./Checkout.tsx', import.meta.url)), 'utf8');
const paypal = readFileSync(fileURLToPath(new URL('../components/checkout/PayPalCheckoutReliable.tsx', import.meta.url)), 'utf8');

describe('provider-neutral checkout integrity', () => {
  it('restores a fixed active marker and reconciles Stripe by checkout key only', () => {
    expect(checkout).toContain('readActiveCheckoutMarker()');
    expect(checkout).toContain('useState<ActiveCheckoutMarker | null>(initialActiveCheckout)');
    expect(checkout).toContain('useState(Boolean(initialActiveCheckout))');
    expect(checkout).toContain("body: JSON.stringify({ checkoutKey: marker.checkoutKey })");
    expect(checkout).toContain("if (stripeRuntime.status === 'available')");
    expect(checkout).toContain("if (items.length === 0 && !checkoutLocked)");
    expect(checkout).toContain("window.addEventListener('beforeunload', warnBeforeLeaving)");
  });

  it('locks cart and provider mutations during an unresolved authorization', () => {
    expect(checkout).toContain('disabled={checkoutLocked || item.quantity <= 1}');
    expect(checkout).toContain('disabled={checkoutLocked || item.quantity >= 999}');
    expect(checkout).toContain('<SameDayHitServiceCard disabled={checkoutLocked} />');
    expect(checkout).toContain('disabled={checkoutLocked}');
    expect(checkout).toContain('if (!checkoutLocked) setPaymentProvider');
    expect(checkout).toContain('providerLocked={checkoutLocked}');
    expect(checkout).toContain('disabled={paymentSubmissionBlocked || checkoutLocked}');
  });

  it('uses one clear Card and PayPal selector without duplicate payment hierarchies', () => {
    expect(checkout).toContain('Choose a payment method');
    expect(checkout).toContain('Card &amp; wallets');
    expect(checkout).toContain('aria-pressed={paymentProvider');
    expect(checkout).not.toContain('Additional payment options');
    expect(checkout).not.toContain('onSwitchToPayPal=');
  });

  it('keeps the PayPal recovery binding across cart signature changes', () => {
    expect(paypal).toContain('if (activeBindingRef.current || verificationLockedRef.current) return');
    expect(paypal).toContain("const PAYPAL_RECOVERY_STORAGE_KEY = 'bof-paypal-checkout-v6'");
    expect(paypal).toContain('resumeCheckout?.provider === \'paypal\'');
    expect(paypal).toContain('onPaymentStateChange?.({');
  });

  it('requires explicit review after applying a server stale-cart quote', () => {
    expect(checkout).toContain('applyCanonicalPricingQuote(quote)');
    expect(checkout).toContain('serverTotalCents === quote.totalCents');
    expect(checkout).toContain('applyFailed: !applied');
    expect(checkout).toContain('I reviewed the updated total');
    expect(checkout).toContain("staleCartReview.applyFailed ? 'Refresh checkout'");
    expect(checkout).toContain('paymentSubmissionBlocked');
    expect(paypal).toContain("pending?.error === 'STALE_CART_TOTAL'");
    expect(paypal).toContain('rotatePendingBinding();');
  });
});
