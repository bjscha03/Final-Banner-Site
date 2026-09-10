import { describe, expect, it } from 'vitest';
import { sanitizedStripeReturnPath } from './stripeReturnUrl';

describe('Stripe return URL hygiene', () => {
  it('removes Stripe redirect values while preserving unrelated query and hash state', () => {
    const cleaned = sanitizedStripeReturnPath(
      'https://bannersonthefly.com/checkout?source_page=%2Fdesign&payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_sensitive&redirect_status=succeeded&stripe_return=1&coupon=SAVE20#payment',
    );

    expect(cleaned).toBe('/checkout?source_page=%2Fdesign&coupon=SAVE20#payment');
    expect(cleaned).not.toContain('pi_123');
    expect(cleaned).not.toContain('client_secret');
  });

  it('removes duplicate Stripe parameters and leaves a clean checkout path', () => {
    expect(sanitizedStripeReturnPath(
      'https://bannersonthefly.com/checkout?payment_intent=one&payment_intent=two&stripe_return=1',
    )).toBe('/checkout');
  });

  it('does not rewrite an unrelated checkout URL', () => {
    expect(sanitizedStripeReturnPath(
      'https://bannersonthefly.com/checkout?source_page=%2Fgoogle-ads-banner',
    )).toBeNull();
  });
});
