import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import captureModule from './_shared/legacy/paypal-capture-forward.cjs';
import customerInfoModule from './_shared/legacy/paypal-customer-info.cjs';
import orderConfirmationModule from './_shared/order-confirmation-token.cjs';
import runtimeConfig from './_shared/paypal-runtime-config.cjs';
import internalUrlModule from './_shared/stripe-runtime-config.cjs';

const { constantTimeEqual } = orderConfirmationModule;

let neonFactory = neon;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, max-age=0',
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

const getSiteUrl = internalUrlModule.siteUrlForEvent;

const queuePaidOrderFollowups = async (event, orderId) => {
  const siteUrl = getSiteUrl(event);
  if (!siteUrl || !orderId) return false;
  const secret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const requestHeaders = { 'Content-Type': 'application/json' };
  if (secret) requestHeaders['X-Internal-Job-Secret'] = secret;

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/process-paid-order-followups-background`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ orderId }),
    });
    return response.ok;
  } catch (error) {
    console.error('[paypal-payment-status] could not queue paid-order follow-ups', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const paidPayload = (order, confirmationAccess = {}) => {
  const access = typeof confirmationAccess === 'string'
    ? { orderConfirmationToken: confirmationAccess }
    : (confirmationAccess || {});
  return ({
    ok: true,
    success: true,
    finalized: true,
    paymentCaptured: true,
    reconciliationRequired: false,
    paymentStatusUnknown: false,
    // Keep the verified-completion shape expected by the checkout client.
    doNotRetry: false,
    internalOrderId: order.id,
    orderID: order.paypal_order_id,
    paypalOrderID: order.paypal_order_id,
    captureID: order.paypal_capture_id,
    orderConfirmationToken: access.orderConfirmationToken || null,
    orderConfirmationTokenAvailable: access.orderConfirmationTokenAvailable
      ?? Boolean(access.orderConfirmationToken),
    orderAccessRecovery: access.orderAccessRecovery || null,
    status: 'COMPLETED',
    captureStatus: 'COMPLETED',
    customerEmail: order.email || null,
    customerName: order.customer_name || order.shipping_name || null,
    customerPhone: order.customer_phone || null,
    shippingAddress: {
      name: order.shipping_name || order.customer_name || null,
      street: order.shipping_street || null,
      street2: order.shipping_street2 || null,
      city: order.shipping_city || null,
      state: order.shipping_state || null,
      zip: order.shipping_zip || null,
      country: order.shipping_country || 'US',
    },
    subtotal_cents: Number(order.subtotal_cents || 0),
    tax_cents: Number(order.tax_cents || 0),
    total_cents: Number(order.total_cents || 0),
    confirmationEmailStatus: order.confirmation_email_status || null,
    adminNotificationStatus: order.admin_notification_status || null,
  });
};

const loadOrder = async (sql, internalOrderId) => {
  const rows = await sql`
    SELECT id, status, subtotal_cents, tax_cents, total_cents, email,
           customer_name, customer_phone, shipping_name, shipping_street,
           shipping_street2, shipping_city, shipping_state, shipping_zip,
           shipping_country, paypal_order_id, paypal_capture_id,
           checkout_idempotency_key,
           payment_reconciliation_status, confirmation_email_status,
           admin_notification_status
      FROM orders
     WHERE id = ${internalOrderId}
     LIMIT 1
  `;
  return rows[0] || null;
};

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  const runtime = runtimeConfig.preparePayPalRuntime({ requireFeature: false, event });
  if (!runtime.enabled) {
    return reply(503, {
      ok: false,
      finalized: false,
      paymentCaptured: false,
      paymentStatusUnknown: true,
      reconciliationRequired: true,
      doNotRetry: true,
      safeToRetry: false,
      error: 'PAYPAL_DISABLED',
      message: 'PayPal payment verification is unavailable for this deploy. Do not submit another payment.',
    });
  }

  let input = {};
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }
  const internalOrderId = String(input.internalOrderId || '').trim();
  const checkoutKey = String(input.checkoutKey || '').trim();
  if (!internalOrderId) return reply(400, { ok: false, error: 'INTERNAL_ORDER_REQUIRED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const sql = neonFactory(dbUrl);

  try {
    let order = await loadOrder(sql, internalOrderId);
    if (!order) return reply(404, { ok: false, error: 'ORDER_NOT_FOUND' });
    if (!checkoutKey || !constantTimeEqual(checkoutKey, order.checkout_idempotency_key)) {
      return reply(401, { ok: false, error: 'CHECKOUT_CONFIRMATION_REQUIRED' });
    }

    if (!order.paypal_order_id) {
      return reply(200, {
        ok: true,
        finalized: false,
        paymentCaptured: false,
        reconciliationRequired: false,
        paymentStatusUnknown: false,
        retryAllowed: true,
        internalOrderId,
        status: order.status,
      });
    }

    const captureResponse = await captureModule.handler({
      ...event,
      httpMethod: 'POST',
      headers: event.headers || {},
      body: JSON.stringify({
        orderID: order.paypal_order_id,
        internalOrderId,
        checkoutKey: order.checkout_idempotency_key,
        reconcileOnly: true,
      }),
    });

    let capturePayload = {};
    try { capturePayload = JSON.parse(captureResponse?.body || '{}'); } catch { /* no-op */ }

    const statusCode = Number(captureResponse?.statusCode || 500);
    if (
      statusCode === 200
      && capturePayload?.paymentCaptured === true
      && capturePayload?.captureStatus === 'COMPLETED'
    ) {
      order = await loadOrder(sql, internalOrderId) || order;
      void queuePaidOrderFollowups(event, internalOrderId);
      return reply(200, paidPayload(
        order,
        capturePayload,
      ));
    }

    if (statusCode === 422 && capturePayload?.paymentCaptured !== true) {
      let retired = false;
      try {
        retired = await customerInfoModule.retireDefinitivelyDeclinedPayPalOrder({
          internalOrderId,
          orderID: order.paypal_order_id,
        });
      } catch (error) {
        console.error('[paypal-payment-status] could not retire declined PayPal order', {
          internalOrderId,
          paypalOrderId: order.paypal_order_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!retired) {
        try {
          await customerInfoModule.lockPayPalOrderForReconciliation({
            internalOrderId,
            orderID: order.paypal_order_id,
          });
        } catch (error) {
          console.error('[paypal-payment-status] could not reconciliation-lock declined PayPal order', {
            internalOrderId,
            paypalOrderId: order.paypal_order_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return reply(202, {
          ...capturePayload,
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
      }
      return reply(422, {
        ...capturePayload,
        restartPayment: false,
        retryAllowed: true,
        reconciliationRequired: false,
        paymentStatusUnknown: false,
      });
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify(capturePayload),
    };
  } catch (error) {
    console.error('[paypal-payment-status] failed', {
      internalOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return reply(500, { ok: false, error: 'PAYMENT_STATUS_CHECK_FAILED' });
  }
};

export const _test = {
  handler,
  paidPayload,
  getSiteUrl,
  queuePaidOrderFollowups,
  resetNeonFactory() {
    neonFactory = neon;
  },
  setNeonFactory(factory) {
    neonFactory = factory;
  },
};
export default withLambda(handler);
