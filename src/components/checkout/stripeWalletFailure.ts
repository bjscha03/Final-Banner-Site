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
      if (!(error instanceof Error) || !error.message.startsWith('Unexpected call to paymentFailed()')) throw error;
    }
  };
}
