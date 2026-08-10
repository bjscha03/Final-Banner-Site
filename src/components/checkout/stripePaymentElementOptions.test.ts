import { describe, expect, it } from 'vitest';
import { stripeCardPaymentElementOptions } from './stripePaymentElementOptions';

describe('Stripe card Payment Element options', () => {
  it('uses Stripe-supported accordion radio modes', () => {
    const layout = stripeCardPaymentElementOptions.layout;

    expect(typeof layout).toBe('object');
    expect(layout).toMatchObject({
      type: 'accordion',
      radios: 'never',
    });
    expect(['always', 'never', 'auto', 'if_multiple']).toContain(
      typeof layout === 'object' ? layout.radios : undefined,
    );
  });

  it('keeps wallets out of the card form so they only appear in Express Checkout', () => {
    expect(stripeCardPaymentElementOptions.wallets).toEqual({
      applePay: 'never',
      googlePay: 'never',
    });
  });
});
