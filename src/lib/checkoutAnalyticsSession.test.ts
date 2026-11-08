import { beforeEach, describe, expect, it } from 'vitest';
import { checkoutCartFingerprint, markCheckoutInitiated, markPaymentFieldsReady, clearCheckoutAnalyticsSession } from './checkoutAnalyticsSession';

const item = { id: 'banner-1', quantity: 1, line_total_cents: 3400, width_in: 72, height_in: 36, material: 'vinyl' };
const cart = checkoutCartFingerprint([item]);

describe('checkout analytics session', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearCheckoutAnalyticsSession();
  });

  it('fires begin checkout once through two reloads and a back/return', () => {
    expect(markCheckoutInitiated(cart)).toBe(true);
    expect(markCheckoutInitiated(cart)).toBe(false); // reload 1
    expect(markCheckoutInitiated(cart)).toBe(false); // reload 2
    expect(markCheckoutInitiated(cart)).toBe(false); // history return
  });

  it('starts a new checkout when cart items change or after purchase', () => {
    expect(markCheckoutInitiated(cart)).toBe(true);
    const changed = checkoutCartFingerprint([item, { ...item, id: 'banner-2' }]);
    expect(markCheckoutInitiated(changed)).toBe(true);
    clearCheckoutAnalyticsSession();
    expect(markCheckoutInitiated(changed)).toBe(true);
  });

  it('does not treat cart reorder as a new checkout', () => {
    const second = { ...item, id: 'banner-2' };
    expect(checkoutCartFingerprint([item, second])).toBe(checkoutCartFingerprint([second, item]));
  });

  it('tracks payment fields ready only once per provider and method per cart', () => {
    expect(markPaymentFieldsReady('stripe', 'wallet', cart)).toBe(true);
    expect(markPaymentFieldsReady('stripe', 'wallet', cart)).toBe(false);
    expect(markPaymentFieldsReady('paypal', 'paypal', cart)).toBe(true);
    expect(markPaymentFieldsReady('stripe', 'wallet', checkoutCartFingerprint([{ ...item, quantity: 2 }]))).toBe(true);
  });
});
