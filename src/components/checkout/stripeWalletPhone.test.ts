import { describe, expect, it } from 'vitest';
import { isValidCheckoutPhone, selectWalletCheckoutPhone } from './stripeWalletPhone';

describe('Stripe wallet phone fallback', () => {
  it('prefers a valid wallet phone and otherwise uses the site-controlled fallback', () => {
    expect(selectWalletCheckoutPhone({
      billingPhone: '+1 (555) 111-2222',
      shippingPhone: '+1 (555) 333-4444',
      fallbackPhone: '+1 (555) 555-6666',
    })).toBe('+1 (555) 111-2222');

    expect(selectWalletCheckoutPhone({
      billingPhone: '',
      shippingPhone: null,
      fallbackPhone: '+1 (555) 555-6666',
    })).toBe('+1 (555) 555-6666');
  });

  it('returns no phone when neither the wallet nor fallback supplied a valid value', () => {
    expect(selectWalletCheckoutPhone({
      billingPhone: '123',
      shippingPhone: '',
      fallbackPhone: '555',
    })).toBe('');
    expect(isValidCheckoutPhone('555')).toBe(false);
  });
});
