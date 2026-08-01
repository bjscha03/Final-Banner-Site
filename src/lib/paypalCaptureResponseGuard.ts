const CAPTURE_ENDPOINT = '/.netlify/functions/paypal-capture-minimal';

const isDefinitiveCompletedCapture = (payload: any): boolean => Boolean(
  payload?.paymentCaptured === true
  && payload?.reconciliationRequired !== true
  && payload?.paymentStatusUnknown !== true
  && payload?.doNotRetry !== true
  && payload?.captureStatus === 'COMPLETED'
  && payload?.captureID
  && (payload?.status === 'COMPLETED' || payload?.success === true),
);

const shouldForceDoNotRetryLock = (payload: any): boolean => {
  // A normal, fully verified capture must continue through the checkout's
  // success handler and redirect. Lock only uncertain/reconciliation states.
  if (isDefinitiveCompletedCapture(payload)) return false;

  return Boolean(
    payload?.doNotRetry
    || payload?.paymentStatusUnknown
    || payload?.reconciliationRequired
    || payload?.paymentCaptured,
  );
};

/**
 * Temporary containment guard for the current PayPal checkout component.
 * Responses that say payment may have been captured or is being reconciled are
 * normalized into the component's lock contract. A definitive COMPLETED
 * capture is deliberately left untouched so the customer reaches the success
 * page instead of hanging forever in the verification state.
 */
export function installPayPalCaptureResponseGuard(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if ((window as any).__PAYPAL_CAPTURE_RESPONSE_GUARD__) return;
  (window as any).__PAYPAL_CAPTURE_RESPONSE_GUARD__ = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (!url.includes(CAPTURE_ENDPOINT)) return response;

    try {
      const payload = await response.clone().json();
      if (!shouldForceDoNotRetryLock(payload)) return response;

      const normalized = {
        ...payload,
        paymentCaptured: payload.paymentCaptured === true || payload.paymentStatusUnknown === true || payload.reconciliationRequired === true,
        reconciliationRequired: true,
        doNotRetry: true,
        message: payload.message || 'We are verifying your payment. Do not submit another payment.',
      };

      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };
}

export const _test = { shouldForceDoNotRetryLock, isDefinitiveCompletedCapture };
