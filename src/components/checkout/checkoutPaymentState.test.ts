import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_CHECKOUT_STORAGE_KEY,
  ACTIVE_CHECKOUT_TTL_MS,
  clearActiveCheckoutMarker,
  readActiveCheckoutMarker,
  writeActiveCheckoutMarker,
} from './checkoutPaymentState';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) || null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
};

describe('provider-neutral active checkout marker', () => {
  it('survives independently of a cart signature', () => {
    const target = storage();
    writeActiveCheckoutMarker({
      provider: 'stripe',
      checkoutKey: 'checkout-key-at-least-16',
      phase: 'verifying',
      orderId: 'order-1',
      paymentIntentId: 'pi_1',
      totalCents: 10400,
    }, target, 100);

    expect(readActiveCheckoutMarker(target, 101)).toMatchObject({
      provider: 'stripe',
      checkoutKey: 'checkout-key-at-least-16',
      orderId: 'order-1',
      totalCents: 10400,
    });
    expect(target.setItem).toHaveBeenCalledWith(ACTIVE_CHECKOUT_STORAGE_KEY, expect.any(String));
  });

  it('expires stale markers and only clears the expected checkout flight', () => {
    const target = storage();
    writeActiveCheckoutMarker({
      provider: 'paypal',
      checkoutKey: 'paypal-checkout-key-1',
      phase: 'processing',
    }, target, 100);
    clearActiveCheckoutMarker('different-flight', target);
    expect(readActiveCheckoutMarker(target, 101)).not.toBeNull();
    expect(readActiveCheckoutMarker(target, 100 + ACTIVE_CHECKOUT_TTL_MS + 1)).toBeNull();
  });

  it('restores a checkout-key-only marker after a lost authorization response', () => {
    const target = storage();
    writeActiveCheckoutMarker({
      provider: 'stripe',
      checkoutKey: 'key-only-lost-response',
      phase: 'authorizing',
    }, target, 100);

    expect(readActiveCheckoutMarker(target, 101)).toEqual({
      provider: 'stripe',
      checkoutKey: 'key-only-lost-response',
      phase: 'authorizing',
      orderId: null,
      paymentIntentId: null,
      totalCents: null,
      updatedAt: 100,
    });
  });
});
