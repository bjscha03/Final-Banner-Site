import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import captureModule from './_shared/legacy/paypal-capture-forward.cjs';
import customerInfoModule from './_shared/legacy/paypal-customer-info.cjs';

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

const getSiteUrl = (event) => {
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host;
  if (host) return `https://${host}`;
  const configured = process.env.DEPLOY_PRIME_URL || process.env.URL || process.env.PUBLIC_SITE_URL;
  return configured ? String(configured).replace(/\/$/, '') : null;
};

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

const paidPayload = (order) => ({
  ok: true,
  success: true,
  finalized: true,
  paymentCaptured: true,
  reconciliationRequired: false,
  paymentStatusUnknown: false,
  doNotRetry: false,
  internalOrderId: order.id,
  orderID: order.paypal_order_id,
  paypalOrderID: order.paypal_order_id,
  captureID: order.paypal_capture_id,
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

const loadOrder = async (sql, internalOrderId) => {
  const rows = await sql`
    SELECT id, status, subtotal_cents, tax_cents, total_cents, email,
           customer_name, customer_phone, shipping_name, shipping_street,
           shipping_street2, shipping_city, shipping_state, shipping_zip,
           shipping_country, paypal_order_id, paypal_capture_id,
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

  let input = {};
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }
  const internalOrderId = String(input.internalOrderId || '').trim();
  if (!internalOrderId) return reply(400, { ok: false, error: 'INTERNAL_ORDER_REQUIRED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const sql = neon(dbUrl);

  try {
    let order = await loadOrder(sql, internalOrderId);
    if (!order) return reply(404, { ok: false, error: 'ORDER_NOT_FOUND' });

    if (order.status === 'paid' && order.paypal_capture_id) {
      if (order.paypal_order_id) {
        try {
          await customerInfoModule.refreshOrderCustomerInfo({
            internalOrderId,
            orderID: order.paypal_order_id,
            approvedOrderData: input.approvedOrderData,
            shippingChangeData: input.shippingChangeData,
          });
          order = await loadOrder(sql, internalOrderId) || order;
        } catch (error) {
          console.error('[paypal-payment-status] customer refresh failed for paid order', {
            internalOrderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      void queuePaidOrderFollowups(event, order.id);
      return reply(200, paidPayload(order));
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
      httpMethod: 'POST',
      headers: event.headers || {},
      body: JSON.stringify({
        orderID: order.paypal_order_id,
        internalOrderId,
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
      try {
        await customerInfoModule.refreshOrderCustomerInfo({
          internalOrderId,
          orderID: order.paypal_order_id,
          approvedOrderData: input.approvedOrderData,
          shippingChangeData: input.shippingChangeData,
        });
      } catch (error) {
        console.error('[paypal-payment-status] customer refresh failed after reconciliation', {
          internalOrderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      order = await loadOrder(sql, internalOrderId) || order;
      void queuePaidOrderFollowups(event, internalOrderId);
      return reply(200, paidPayload(order));
    }

    if (statusCode === 422 && capturePayload?.paymentCaptured !== true) {
      try {
        await customerInfoModule.retireDefinitivelyDeclinedPayPalOrder({
          internalOrderId,
          orderID: order.paypal_order_id,
        });
      } catch { /* retry remains available even if cleanup logs elsewhere */ }
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

export const _test = { paidPayload, getSiteUrl, queuePaidOrderFollowups };
export default withLambda(handler);
