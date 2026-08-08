import { describe, expect, it } from 'vitest';
import { getStripeExpressShippingRates } from './stripeExpressShipping';

describe('Stripe Express Checkout shipping rates', () => {
  it('returns the canonical zero-cost shipping option required by wallet address collection', () => {
    expect(getStripeExpressShippingRates()).toEqual([
      {
        id: 'bof-free-next-day-air',
        displayName: 'Free next-day air after production',
        amount: 0,
      },
    ]);
  });

  it('returns a fresh payload for each Stripe create or event resolution', () => {
    const first = getStripeExpressShippingRates();
    const second = getStripeExpressShippingRates();

    expect(first).not.toBe(second);
    first[0].displayName = 'changed locally';
    expect(second[0].displayName).toBe('Free next-day air after production');
  });
});
