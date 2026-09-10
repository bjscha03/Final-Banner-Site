const STRIPE_RETURN_QUERY_KEYS = [
  'payment_intent',
  'payment_intent_client_secret',
  'redirect_status',
  'stripe_return',
] as const;

/**
 * Removes Stripe's redirect bookkeeping from the visible URL while retaining
 * every unrelated query parameter and the hash. Recovery authorization comes
 * exclusively from sessionStorage plus the same-origin POST status endpoint.
 */
export const sanitizedStripeReturnPath = (href: string): string | null => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const hadStripeParams = STRIPE_RETURN_QUERY_KEYS.some((key) => url.searchParams.has(key));
  if (!hadStripeParams) return null;
  STRIPE_RETURN_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}`;
};
