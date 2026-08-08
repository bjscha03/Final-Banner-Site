import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { togglePayPalCardFields } from './paypalCardDisclosure';

const paypalSource = readFileSync(
  fileURLToPath(new URL('./PayPalCheckoutReliable.tsx', import.meta.url)),
  'utf8',
);
const checkoutSource = readFileSync(
  fileURLToPath(new URL('../../pages/Checkout.tsx', import.meta.url)),
  'utf8',
);

describe('PayPal-hosted debit or credit card disclosure', () => {
  it('opens independently of cart validity and mounts the existing hosted card flow', () => {
    // Simulate the disclosure click's state transition. The source assertions
    // below bind the expanded state to the hosted provider/form mount.
    expect(togglePayPalCardFields(false)).toBe(true);
    const disclosure = paypalSource.slice(
      paypalSource.indexOf('const renderInlineCardFields'),
      paypalSource.indexOf('return (', paypalSource.indexOf('const renderInlineCardFields')),
    );
    expect(disclosure).toContain('disabled={cardToggleDisabled}');
    expect(paypalSource).toContain('const cardToggleDisabled = providerLocked');
    expect(disclosure).toContain('setCardFieldsExpanded(togglePayPalCardFields)');
    expect(disclosure).toContain('aria-expanded={cardFieldsExpanded}');
    expect(disclosure).toContain('cardFieldsExpanded ? (');
    expect(disclosure).toContain('<PayPalCardFieldsProvider');
    expect(disclosure).toContain('<PayPalCardFieldsForm />');
    expect(disclosure).toContain('createOrder={handleCreateOrder}');
    expect(disclosure).toContain('onApprove={(data) => handleApprove(data, null)}');
  });

  it('keeps the hosted card choice in the Stripe-enabled alternate provider view', () => {
    expect(checkoutSource).not.toContain('paypalOnly\n');
    expect(checkoutSource).toMatch(/<PayPalCheckout[\s\S]*?cardFirstLayout/);
    expect(checkoutSource).toContain('providerLocked={checkoutLocked}');
  });

  it('keeps the existing PayPal order callbacks and complete checkout payload', () => {
    expect(paypalSource).toContain('createOrder={handleCreateOrder}');
    expect(paypalSource).toContain('onApprove={handleApprove}');
    expect(paypalSource).toContain('items,\n            discountCode');
    expect(paypalSource).toContain('quantity: item.quantity');
    expect(paypalSource).toContain('customer: submitted');
    expect(paypalSource).toContain('shippingAddress: submitted.shippingAddress');
    expect(paypalSource.match(/checkoutKey: checkoutKeyRef\.current/g)?.length).toBeGreaterThanOrEqual(3);
    expect(paypalSource).toMatch(/paypal-create-order[\s\S]*?checkoutKey: checkoutKeyRef\.current/);
    expect(paypalSource).toMatch(/paypal-capture-minimal[\s\S]*?checkoutKey: checkoutKeyRef\.current/);
    expect(paypalSource).toContain('startVerification(\'We are checking the PayPal payment result. Do not submit another payment.\')');
  });

  it('uses a cryptographically strong UUID checkout key', () => {
    expect(paypalSource).toContain("typeof crypto.randomUUID === 'function'");
    expect(paypalSource).toContain("typeof crypto.getRandomValues === 'function'");
    expect(paypalSource).not.toContain('`${Date.now()}-${Math.random()');
  });

  it('applies a canonical stale-cart quote before rotating the pre-provider key', () => {
    expect(paypalSource).toContain("pending?.error === 'STALE_CART_TOTAL'");
    expect(paypalSource).toContain('pendingDetails.canonicalQuote as CanonicalCartQuote');
    expect(paypalSource).toContain('onCanonicalQuote?.(');
    expect(paypalSource).toContain('rotatePendingBinding();');
    expect(checkoutSource.match(/onCanonicalQuote=\{handleCanonicalQuote\}/g)).toHaveLength(3);
  });
});
