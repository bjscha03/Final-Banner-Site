import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const checkout = readFileSync(fileURLToPath(new URL('./Checkout.tsx', import.meta.url)), 'utf8');
const paypal = readFileSync(fileURLToPath(new URL('../components/checkout/PayPalCheckoutReliable.tsx', import.meta.url)), 'utf8');
const stripe = readFileSync(fileURLToPath(new URL('../components/checkout/StripeCheckout.tsx', import.meta.url)), 'utf8');
const toast = readFileSync(fileURLToPath(new URL('../components/ui/toast.tsx', import.meta.url)), 'utf8');

describe('provider-neutral checkout integrity', () => {
  it('restores a fixed active marker and reconciles Stripe by checkout key only', () => {
    expect(checkout).toContain('readActiveCheckoutMarker()');
    expect(checkout).toContain('useState<ActiveCheckoutMarker | null>(initialActiveCheckout)');
    expect(checkout).toContain('useState(Boolean(initialActiveCheckout))');
    expect(checkout).toContain("body: JSON.stringify({ checkoutKey: marker.checkoutKey })");
    expect(checkout).toContain("if (stripeRuntime.status === 'available')");
    expect(checkout).toContain("if (items.length === 0 && !checkoutLocked)");
    expect(checkout).toContain("window.addEventListener('beforeunload', warnBeforeLeaving)");
    expect(checkout).not.toContain('payload?.followupsQueued === true');
    expect(checkout).toContain('payload?.finalized === true');
    expect(checkout).toContain('signal: controller.signal');
    expect(checkout).toContain('window.setTimeout(() => controller.abort(), 8000)');
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

  it('defers signed cart recovery until Stripe or PayPal reconciliation releases the marker', () => {
    expect(checkout).toContain('Boolean(initialCartRecoveryToken && !initialActiveCheckout)');
    expect(checkout).toContain('hasActiveCheckout: Boolean(activeCheckout)');
    expect(checkout).toContain('needsStoredCheckoutRecovery,');
    expect(checkout).toContain('paymentRecoveryChecking: recoveryChecking');
    expect(checkout).toContain('paymentAlreadySucceeded: paymentSuccessHandledRef.current');
    expect(checkout).toContain('clearStoredAbandonedCartRecoveryRetryToken();');
    expect(checkout).toContain('terminateCurrentStartupCartRecovery();');
    expect(checkout).toContain('|| cartRecoveryCanRetry');
    expect(checkout).toContain('Discard recovery and use this cart');
    expect(checkout).toContain('shouldApply: () => isStartupCartRecoveryAttemptCurrent(recoveryRevision)');
  });

  it('requires tracked payment_started persistence before either provider handoff', () => {
    expect(stripe).toContain('paymentSnapshotRequiredButMissing({');
    expect(paypal).toContain('paymentSnapshotRequiredButMissing({');
    expect(stripe).toContain('We could not secure this cart before payment. Please try payment again.');
    expect(paypal).toContain('We could not secure this cart before payment. Please try payment again.');
  });

  it('restores recovered production add-ons through the cart eligibility validator', () => {
    expect(checkout).toContain('restoreCheckoutPreferences: restoreRecoveredCheckoutPreferences');
    expect(checkout).not.toContain('setSameDayHitService(state.sameDayHitService)');
    expect(checkout).not.toContain('setSaturdayDelivery(state.saturdayDelivery)');
  });

  it('uses one clear Card and PayPal selector without duplicate payment hierarchies', () => {
    expect(checkout).toContain('Choose a payment method');
    expect(checkout).toContain('Card &amp; wallets');
    expect(checkout).toContain('aria-label="PayPal"');
    expect(checkout).toContain('bg-[#FFC439]');
    expect(checkout).toContain('text-[#003087]');
    expect(checkout).toContain('text-[#0070BA]');
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

  it('shows the safe provider message and keeps desktop failure toasts fully on screen', () => {
    expect(checkout).toContain('description: error?.userMessage');
    expect(toast).toContain('sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto');
    expect(toast).toContain('sm:w-[calc(100vw-2rem)] sm:max-w-[420px]');
  });
});
