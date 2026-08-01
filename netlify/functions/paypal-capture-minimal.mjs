import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import captureModule from './_shared/legacy/paypal-capture-forward.cjs';
import customerInfoModule from './_shared/legacy/paypal-customer-info.cjs';

const clean = (value, max = 500) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const getSiteUrl = (event) => {
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host;
  if (host) return `https://${host}`;
  const configured = process.env.DEPLOY_PRIME_URL || process.env.URL || process.env.PUBLIC_SITE_URL;
  return configured ? String(configured).replace(/\/$/, '') : null;
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
    try {
      await customerInfoModule.retireDefinitivelyDeclinedPayPalOrder({
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

  let refreshedCustomer = null;
  try {
    // The hosted PayPal card/wallet UI owns customer entry. Use the SDK-approved
    // representation plus a fresh server-side PayPal GET so Admin and Resend do
    // not depend on the abbreviated capture response.
    refreshedCustomer = await customerInfoModule.refreshOrderCustomerInfo({
      internalOrderId,
      orderID: paypalOrderId,
      submitted: requestBody.customerInfo,
      approvedOrderData: requestBody.approvedOrderData,
      shippingChangeData: requestBody.shippingChangeData,
    });
  } catch (error) {
    // Payment is already durable. Customer-data trouble is logged and retried
    // by the webhook/status paths; it must never create a second charge prompt.
    console.error('[paypal-capture-minimal] customer information refresh failed', {
      internalOrderId,
      paypalOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const followupsQueued = await queuePaidOrderFollowups(event, internalOrderId);
  response.body = JSON.stringify({
    ...responseBody,
    customerInfoPersisted: Boolean(refreshedCustomer)
      || Boolean(responseBody.customerEmail || responseBody.customerName),
    customerEmail: refreshedCustomer?.email || responseBody.customerEmail || null,
    customerName: refreshedCustomer?.customer_name || responseBody.customerName || null,
    customerPhone: refreshedCustomer?.customer_phone || responseBody.customerPhone || null,
    shippingAddress: refreshedCustomer
      ? {
          name: refreshedCustomer.shipping_name || refreshedCustomer.customer_name || null,
          street: refreshedCustomer.shipping_street || null,
          street2: refreshedCustomer.shipping_street2 || null,
          city: refreshedCustomer.shipping_city || null,
          state: refreshedCustomer.shipping_state || null,
          zip: refreshedCustomer.shipping_zip || null,
          country: refreshedCustomer.shipping_country || 'US',
        }
      : responseBody.shippingAddress || null,
    followupsQueued,
  });
  return response;
};

export const _test = {
  getSiteUrl,
  queuePaidOrderFollowups,
};

export default withLambda(handler);
