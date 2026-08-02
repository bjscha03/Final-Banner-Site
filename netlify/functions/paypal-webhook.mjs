import { withLambda } from '@netlify/aws-lambda-compat';
import webhookModule from './_shared/legacy/paypal-webhook-forward.cjs';
import customerInfoModule from './_shared/legacy/paypal-customer-info.cjs';
import paypalConversionHelpers from './_shared/paypalConversionHelpers.cjs';
import runtimeConfig from './_shared/paypal-runtime-config.cjs';

const { getPayPalWebhookOrderId } = paypalConversionHelpers;

const getSiteUrl = (event) => {
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host;
  if (host) return `https://${host}`;
  const configured = process.env.DEPLOY_PRIME_URL || process.env.URL || process.env.PUBLIC_SITE_URL;
  return configured ? String(configured).replace(/\/$/, '') : null;
};

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

  const paypalOrderId = getProviderOrderId(event, payload);
  const definitivePaidState = Boolean(
    payload?.orderId
    && payload?.paymentCaptured === true
    && payload?.captureID
    && paypalOrderId,
  );
  if (!definitivePaidState) return response;

  let refreshedCustomer = null;
  try {
    refreshedCustomer = await customerInfoModule.refreshOrderCustomerInfo({
      internalOrderId: payload.orderId,
      orderID: paypalOrderId,
    });
  } catch (error) {
    console.error('[paypal-webhook] customer information refresh failed', {
      orderId: payload.orderId,
      paypalOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const followupsQueued = await queuePaidOrderFollowups(event, payload.orderId);
  response.body = JSON.stringify({
    ...payload,
    orderID: paypalOrderId,
    paypalOrderID: paypalOrderId,
    customerInfoPersisted: Boolean(refreshedCustomer),
    followupsQueued,
  });
  return response;
};

export const _test = { getSiteUrl, getProviderOrderId, queuePaidOrderFollowups };
export default withLambda(handler);
