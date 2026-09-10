export type StripeExpressShippingRate = {
  id: string;
  displayName: string;
  amount: number;
};

/**
 * Checkout currently has one server-authoritative shipping choice: free
 * next-day air after production. Stripe requires a valid shipping rate any
 * time the Express Checkout Element collects a shipping address.
 */
export const getStripeExpressShippingRates = (): StripeExpressShippingRate[] => ([
  {
    id: 'bof-free-next-day-air',
    displayName: 'Free next-day air after production',
    amount: 0,
  },
]);
