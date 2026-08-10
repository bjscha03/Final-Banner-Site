import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import captureModule from './_shared/legacy/paypal-capture-forward.cjs';
import customerInfoModule from './_shared/legacy/paypal-customer-info.cjs';
import runtimeConfig from './_shared/paypal-runtime-config.cjs';
import internalUrlModule from './_shared/stripe-runtime-config.cjs';

const clean = (value, max = 500) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const getSiteUrl = internalUrlModule.siteUrlForEvent;

const queuePaidOrderFollowups = async (event, orderId) => {
  const siteUrl = getSiteUrl(event);
  if (!siteUrl || !orderId) return false;

  const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const requestHeaders = { 'Content-Type': 'application/json' };
  if (internalSecret) requestHeaders['X-Internal-Job-Secret'] = internalSecret;

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/process-paid-order-followups-background`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ orderId }),
    });
    if (!response.ok) {
      console.error('[paypal-capture-minimal] follow-up queue rejected', {
        orderId,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[paypal-capture-minimal] follow-up queue failed', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const handler = async (event, context) => {
  if (event.httpMethod === 'POST') {
    const runtime = runtimeConfig.preparePayPalRuntime({ requireFeature: false, event });
    if (!runtime.enabled) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
        body: JSON.stringify({
          ok: false,
          success: false,
          paymentCaptured: false,
          paymentStatusUnknown: true,
          reconciliationRequired: true,
          doNotRetry: true,
          safeToRetry: false,
          error: 'PAYPAL_DISABLED',
          message: 'PayPal payment verification is unavailable for this deploy. Do not submit another payment.',
        }),
      };
    }
  }

  let requestBody = {};
  try { requestBody = JSON.parse(event.body || '{}'); } catch { /* authoritative handler returns INVALID_JSON */ }

  const response = await captureModule.handler(event, context);
  const statusCode = Number(response?.statusCode || 500);

  let responseBody = {};
  try { responseBody = JSON.parse(response?.body || '{}'); } catch { return response; }

  const internalOrderId = clean(requestBody.internalOrderId, 100)
    || clean(responseBody.internalOrderId, 100);
  const paypalOrderId = clean(requestBody.orderID, 200)
    || clean(responseBody.orderID, 200)
    || clean(responseBody.paypalOrderID, 200);

  const definitiveDecline = Boolean(
    statusCode === 422
    && responseBody.paymentCaptured !== true
    && responseBody.reconciliationRequired !== true
    && responseBody.paymentStatusUnknown !== true,
  );

  if (definitiveDecline && internalOrderId && paypalOrderId) {
    let retired = false;
    try {
      retired = await customerInfoModule.retireDefinitivelyDeclinedPayPalOrder({
        internalOrderId,
        orderID: paypalOrderId,
      });
    } catch (error) {
      console.error('[paypal-capture-minimal] could not retire declined PayPal order', {
        internalOrderId,
        paypalOrderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!retired) {
      try {
        await customerInfoModule.lockPayPalOrderForReconciliation({
          internalOrderId,
          orderID: paypalOrderId,
        });
      } catch (error) {
        console.error('[paypal-capture-minimal] could not reconciliation-lock declined PayPal order', {
          internalOrderId,
          paypalOrderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      response.statusCode = 202;
      response.body = JSON.stringify({
        ...responseBody,
        ok: true,
        success: false,
        paymentCaptured: false,
        paymentStatusUnknown: true,
        reconciliationRequired: true,
        doNotRetry: true,
        safeToRetry: false,
        restartPayment: false,
        retryAllowed: false,
        error: 'PAYPAL_DECLINE_RETIREMENT_INCOMPLETE',
        message: 'This payment attempt could not be safely unlocked. Do not submit another payment while we verify it.',
      });
      return response;
    }

    response.body = JSON.stringify({
      ...responseBody,
      restartPayment: false,
      retryAllowed: true,
      message: responseBody.message || 'Your card was declined. Use a different card or payment method and try again.',
    });
    return response;
  }

  const definitivePaidState = Boolean(
    statusCode === 200
    && responseBody.paymentCaptured === true
    && responseBody.captureStatus === 'COMPLETED'
    && responseBody.captureID
    && responseBody.reconciliationRequired !== true
    && responseBody.paymentStatusUnknown !== true,
  );

  if (!definitivePaidState || !internalOrderId || !paypalOrderId) return response;

  const followupsQueued = await queuePaidOrderFollowups(event, internalOrderId);
  response.body = JSON.stringify({
    ...responseBody,
    // The authoritative capture transaction already persisted the provider
    // GET_FROM_FILE address before returning success. Never mutate paid
    // contact/fulfillment data from a browser retry payload afterward.
    customerInfoPersisted: Boolean(responseBody.customerEmail || responseBody.customerName),
    customerEmail: responseBody.customerEmail || null,
    customerName: responseBody.customerName || null,
    customerPhone: responseBody.customerPhone || null,
    shippingAddress: responseBody.shippingAddress || null,
    followupsQueued,
  });
  return response;
};

export const _test = {
  getSiteUrl,
  handler,
  queuePaidOrderFollowups,
};

export default withLambda(handler);
