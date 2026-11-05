type Failure = { reason: 'fail' | 'invalid_payment_data'; message: string };

/** A native wallet confirm event can be completed only once. Stripe can also
 * close it during token creation or cancellation before our server responds. */
export function createWalletFailureHandler(event: { paymentFailed?: (failure: Failure) => void }) {
  let completed = false;
  return (failure: Failure) => {
    if (completed) return;
    completed = true;
    try {
      event.paymentFailed?.(failure);
    } catch (error) {
      // The checkout already displays/reports the underlying payment error.
      // A closed native sheet must not turn that handled error into a crash.
      // Stripe can throw an Error from its own frame. Cross-realm errors do
      // not pass instanceof Error, so inspect only this known lifecycle message.
      const message = error && typeof error === 'object' && 'message' in error
        ? error.message : null;
      if (typeof message !== 'string' || !message.startsWith('Unexpected call to paymentFailed()')) throw error;
    }
  };
}
