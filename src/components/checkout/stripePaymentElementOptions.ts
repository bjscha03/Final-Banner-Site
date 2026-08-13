import type { StripePaymentElementOptions } from '@stripe/stripe-js';

/**
 * Keep wallet buttons in Express Checkout and the regular card form here.
 * Stripe's current Payment Element contract requires `layout.radios` to use
 * one of its string modes; the former boolean value throws during mount.
 */
export const stripeCardPaymentElementOptions: StripePaymentElementOptions = {
  // Contact and billing details are collected in the merchant-owned form and
  // supplied to createConfirmationToken. Do not ask for the same country or
  // postal details again inside Stripe's card frame.
  fields: { billingDetails: 'never' },
  layout: {
    type: 'accordion',
    defaultCollapsed: false,
    radios: 'never',
    spacedAccordionItems: false,
  },
  paymentMethodOrder: ['card'],
  wallets: { applePay: 'never', googlePay: 'never' },
  terms: { card: 'never' },
};
