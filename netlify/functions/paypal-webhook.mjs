import { withLambda } from '@netlify/aws-lambda-compat';
import webhookModule from './_shared/legacy/paypal-webhook-forward.cjs';
import paypalConversionHelpers from './_shared/paypalConversionHelpers.cjs';
import runtimeConfig from './_shared/paypal-runtime-config.cjs';
import internalUrlModule from './_shared/stripe-runtime-config.cjs';

const { getPayPalWebhookOrderId } = paypalConversionHelpers;

const getSiteUrl = internalUrlModule.siteUrlForEvent;

const getProviderOrderId = (event, payload) => {
  if (payload?.orderID || payload?.paypalOrderID) {
    return payload.orderID || payload.paypalOrderID;
  }

  try {
    const webhook = JSON.parse(event.body || '{}');
    return getPayPalWebhookOrderId(webhook?.resource || {}) || null;
  } catch {
    return null;
  }
};

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
      console.error('[paypal-webhook] follow-up queue rejected', {
        orderId,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[paypal-webhook] follow-up queue failed', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const handler = async (event, context) => {
  runtimeConfig.preparePayPalRuntime();

  const response = await webhookModule.handler(event, context);
  if (Number(response?.statusCode || 500) !== 200) return response;

  let payload = {};
  try { payload = JSON.parse(response.body || '{}'); } catch { return response; }

  // The authenticated core records a completed webhook before this wrapper
  // queues order follow-ups. If that queue call fails, PayPal retries receive
  // the core's idempotent duplicate response. Use that duplicate to retry the
  // queue instead of acknowledging the event and silently losing fulfillment.
  if (payload?.duplicate === true && payload?.orderId) {
    const followupsQueued = await queuePaidOrderFollowups(event, payload.orderId);
    response.statusCode = followupsQueued ? 200 : 503;
    response.body = JSON.stringify({
      ...payload,
      followupsQueued,
      ...(followupsQueued ? {} : { error: 'FOLLOWUPS_NOT_QUEUED' }),
    });
    return response;
  }

  const paypalOrderId = getProviderOrderId(event, payload);
  const definitivePaidState = Boolean(
    payload?.orderId
    && payload?.paymentCaptured === true
    && payload?.captureID
    && paypalOrderId,
  );
  if (!definitivePaidState) return response;

  const followupsQueued = await queuePaidOrderFollowups(event, payload.orderId);
  response.statusCode = followupsQueued ? 200 : 503;
  response.body = JSON.stringify({
    ...payload,
    orderID: paypalOrderId,
    paypalOrderID: paypalOrderId,
    customerInfoPersisted: Boolean(payload.customerEmail || payload.customerName),
    followupsQueued,
    ...(followupsQueued ? {} : { error: 'FOLLOWUPS_NOT_QUEUED' }),
  });
  return response;
};

export const _test = { getSiteUrl, getProviderOrderId, queuePaidOrderFollowups };
export default withLambda(handler);
