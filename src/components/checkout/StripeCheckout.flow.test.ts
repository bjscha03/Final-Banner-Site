import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./StripeCheckout.tsx', import.meta.url)),
  'utf8',
);
const stateSource = readFileSync(
  fileURLToPath(new URL('./stripeCheckoutState.ts', import.meta.url)),
  'utf8',
);
const paymentOptionsSource = readFileSync(
  fileURLToPath(new URL('./stripePaymentElementOptions.ts', import.meta.url)),
  'utf8',
);

describe('Stripe ConfirmationToken client flow', () => {
  it('lets the server confirm the PaymentIntent and only handles required customer action', () => {
    expect(source).toContain('createConfirmationToken');
    expect(source).toContain("payload.status === 'requires_action'");
    expect(source).toContain('stripe.handleNextAction');
    expect(source).not.toContain('stripe.confirmPayment');
    expect(source).not.toContain("paymentMethodCreation: 'manual'");
    expect(source).toContain('payload?.followupsQueued === true');
  });

  it('posts the complete cart, quantity-bearing item specifications, and customer addresses', () => {
    expect(source).toMatch(/items,\s+expectedTotalCents: total/);
    expect(source).toContain('customer: {');
    expect(source).toContain('email: submittedCustomer.email');
    expect(source).toContain('name: submittedCustomer.name');
    expect(source).toContain('phone: submittedCustomer.phone');
    expect(source).toContain('billingAddress: submittedCustomer.billingAddress');
    expect(source).toContain('shippingAddress: submittedCustomer.shippingAddress');
    expect(stateSource).toContain('quantity: item.quantity');
    expect(stateSource).toContain('rope_placement: item.rope_placement || null');
  });

  it('keeps payment recovery references out of query strings', () => {
    expect(source).toContain("fetch(STATUS_ENDPOINT, {");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('body: JSON.stringify({ checkoutKey })');
    expect(source).not.toMatch(/URLSearchParams\(\{\s*paymentIntentId/);
  });

  it('keeps a checkout-key-only lock when the create response is lost', () => {
    expect(source).toContain('checkoutKeyOnlyRecovery: true');
    expect(source).toContain('hasProviderBinding || requiresKeyOnlyRecovery');
    expect(source).toContain('error?.paymentStatusUnknown === true');
    expect(source).toContain("persistRecovery({ phase: 'verifying' })");
    expect(source).toContain('a 404/not_started response is what safely unlocks a retry');
    expect(source).toContain('isStripeKeyOnlyRecovery(initialState)');
    expect(source).toContain('observeStripeKeyOnlyAbsence(absentKeyObservations)');
    expect(source).toContain('Require the full bounded');
  });

  it('persists an ambiguous server-confirm binding before status recovery', () => {
    expect(source).toContain('const recoveryDetails = payload?.details || {}');
    expect(source).toContain('paymentStatusUnknown: recoveryDetails.paymentStatusUnknown === true');
    expect(source).toContain('doNotRetry: recoveryDetails.doNotRetry === true');
    expect(source).toContain('if (error?.paymentStatusUnknown === true || error?.doNotRetry === true) return false');
    expect(source).toContain('const terminal = !verificationLocked && (');
  });

  it('uses the provider decline code nested in backend details', () => {
    expect(source).toContain('error?.details?.declineCode');
    expect(source).toContain('error?.decline_code');
    expect(source).toContain('error?.details?.providerCode');
    expect(source).toContain('recoveryDetails.providerCode || recoveryDetails.stripeCode');
    expect(source).toContain('userMessage: message');
    expect(source).toContain('checkoutErrorRef.current?.scrollIntoView');
    expect(source).toContain("code === 'test_mode_live_card'");
    expect(source).toContain('Use test card 4242 4242 4242 4242');
  });

  it('recovers requires_action behind an explicit resumable customer action', () => {
    expect(source).toContain("payload?.status === 'requires_action'");
    expect(source).toContain('payload?.requiresAction === true');
    expect(source).toContain('setPendingNextAction({');
    expect(source).toContain('Resume secure authentication');
    expect(source).toContain('const resumeRequiredAction = useCallback');
    expect(source).toContain('stripe.handleNextAction({ clientSecret: pending.clientSecret })');
    expect(source).toContain('Never surprise the customer by reopening');
    expect(source).toContain('current.phase !== resumedPhase');
    expect(source).toContain('initialPollStartedForKeyRef.current === initialState.checkoutKey');
  });

  it('always releases a wallet sheet when Elements is unavailable or another payment is active', () => {
    expect(source).toContain('if (!elements || busy) {');
    expect(source).toContain("event.paymentFailed?.({ reason: 'fail', message })");
    expect(source).toContain('Another payment is already being securely verified. Check its status before trying again.');
    expect(source).toContain('Secure payment fields are not ready. Close the wallet and try again.');
    expect(source).toContain('Restoring and securely verifying your payment…');
  });

  it('supplies the canonical shipping rate everywhere wallet address collection requires it', () => {
    expect(source).toContain('shippingAddressRequired: true');
    expect(source.match(/shippingRates: getStripeExpressShippingRates\(\)/g)).toHaveLength(3);
    expect(source).toContain('onShippingAddressChange=');
  });

  it('prioritizes eligible Apple Pay and Google Pay without rendering fake wallet buttons', () => {
    expect(source).toContain("paymentMethodOrder: ['apple_pay', 'google_pay']");
    expect(source).toContain("applePay: 'always'");
    expect(source).toContain("googlePay: 'always'");
    expect(source).toContain("buttonTheme: { applePay: 'black', googlePay: 'black' }");
    expect(source).toContain('aria-hidden={!walletsAvailable}');
    expect(source).toContain("'pointer-events-none absolute inset-x-0 top-0 invisible -z-10'");
    expect(source).not.toContain('Wallet checkout appears automatically on supported devices with an eligible wallet.');
    expect(source).not.toContain('Loading available express payment methods');
    expect(source).toContain('<ExpressCheckoutElement');
    expect(source).not.toMatch(/<button[^>]*>\s*(?:Apple Pay|Google Pay)\s*<\/button>/);
  });

  it('uses a Stripe-supported express-wallet overflow contract', () => {
    expect(source).toContain("layout: { maxColumns: 2, maxRows: 1, overflow: 'auto' }");
    expect(source).not.toMatch(/maxRows:\s*[1-9]\d*[^}]*overflow:\s*['"]never['"]/);
  });

  it('uses the current Stripe Payment Element layout contract', () => {
    expect(source).toContain('options={stripeCardPaymentElementOptions}');
    expect(paymentOptionsSource).toContain("radios: 'never'");
    expect(paymentOptionsSource).not.toContain('radios: false');
  });

  it('stops before payment creation when a wallet omits its phone and focuses a safe fallback', () => {
    const phoneGuard = source.indexOf('if (!isValidCheckoutPhone(submittedWalletCustomer.phone))');
    const elementsSubmit = source.indexOf('const submitResult = await elements.submit();', phoneGuard);
    const paymentStart = source.indexOf("await startPayment(event.expressPaymentType || 'wallet'", phoneGuard);

    expect(phoneGuard).toBeGreaterThan(-1);
    expect(elementsSubmit).toBeGreaterThan(phoneGuard);
    expect(paymentStart).toBeGreaterThan(elementsSubmit);
    expect(source).toContain("event.paymentFailed?.({ reason: 'invalid_payment_data', message })");
    expect(source).toContain('walletPhoneRef.current?.focus()');
    expect(source).toContain("validation.field === 'phone' && walletPhoneRequired");
    expect(source).toContain('No payment was created.');
  });

  it('applies a server canonical stale-cart quote and rotates before any fresh submit', () => {
    expect(source).toContain("payload?.error === 'STALE_CART_TOTAL'");
    expect(source).toContain('recoveryDetails.canonicalQuote as CanonicalCartQuote');
    expect(source).toContain('onCanonicalQuote?.(');
    expect(source).toContain('rotateRecovery();');
  });

  it('rotates the checkout key only when the server rejects edited checkout details', () => {
    expect(source).toContain("payload?.error === 'CHECKOUT_DETAILS_CHANGED'");
    expect(source).toContain('recoveryDetails.restartCheckout === true');
    expect(source).toContain('rotateRecovery()');
    expect(source).toMatch(/resetForRetry[\s\S]*paymentIntentId: null[\s\S]*phase: 'idle'/);
    expect(source.match(/nextActionAttemptedRef\.current\.clear\(\)/g)).toHaveLength(3);
  });
});
