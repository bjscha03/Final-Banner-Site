import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-orders.cjs';

const getPayPalConfig = () => {
  const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const suffix = environment.toUpperCase();
  const clientId = process.env[`PAYPAL_CLIENT_ID_${suffix}`];
  const secret = process.env[`PAYPAL_SECRET_${suffix}`];
  const baseUrl = environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
  return { environment, clientId, secret, baseUrl };
};

const getPayPalAccessToken = async () => {
  const config = getPayPalConfig();
  if (!config.clientId || !config.secret) {
    throw new Error(`PayPal credentials are missing for ${config.environment}`);
  }

  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PayPal OAuth returned ${response.status}`);
  const body = await response.json();
  return { accessToken: body.access_token, baseUrl: config.baseUrl };
};

const getCompletedCapture = (paypalOrder) => {
  const units = Array.isArray(paypalOrder?.purchase_units) ? paypalOrder.purchase_units : [];
  for (const unit of units) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    const capture = captures.find((candidate) => String(candidate?.status || '').toUpperCase() === 'COMPLETED');
    if (capture) return capture;
  }
  return null;
};

const amountToCents = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
};

async function reconcilePendingPayPalOrders(sql, orders, paymentById) {
  const candidates = orders
    .map((order) => ({ order, payment: paymentById.get(String(order?.id)) }))
    .filter(({ order, payment }) => (
      order?.status === 'pending'
      && payment?.paypal_order_id
      && !payment?.paypal_capture_id
      && payment?.payment_reconciliation_status !== 'complete'
    ));

  if (!candidates.length) return;

  let paypal;
  try {
    paypal = await getPayPalAccessToken();
  } catch (error) {
    console.error('[get-orders] PayPal reconciliation could not authenticate', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const { order, payment } of candidates) {
    try {
      const response = await fetch(`${paypal.baseUrl}/v2/checkout/orders/${encodeURIComponent(payment.paypal_order_id)}`, {
        headers: {
          Authorization: `Bearer ${paypal.accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        console.warn('[get-orders] PayPal order lookup failed', {
          orderId: order.id,
          paypalOrderId: payment.paypal_order_id,
          status: response.status,
        });
        continue;
      }

      const paypalOrder = await response.json();
      const capture = getCompletedCapture(paypalOrder);
      if (!capture) continue;

      const currency = String(capture?.amount?.currency_code || '').toUpperCase();
      const capturedCents = amountToCents(capture?.amount?.value);
      const expectedCents = Number(payment.total_cents || order.total_cents || 0);
      if (currency !== 'USD' || !capturedCents || capturedCents !== expectedCents) {
        console.error('[get-orders] Refusing PayPal reconciliation because capture total does not match order', {
          orderId: order.id,
          paypalOrderId: payment.paypal_order_id,
          captureId: capture.id || null,
          currency,
          capturedCents,
          expectedCents,
        });
        continue;
      }

      const updated = await sql`
        UPDATE orders
           SET status = 'paid',
               paypal_capture_id = ${capture.id},
               payment_reconciliation_status = 'complete',
               updated_at = NOW()
         WHERE id = ${order.id}
           AND status = 'pending'
        RETURNING id
      `;
      if (!updated.length) continue;

      payment.paypal_capture_id = capture.id;
      payment.payment_reconciliation_status = 'complete';
      console.log('[get-orders] Reconciled completed PayPal payment for Admin', {
        orderId: order.id,
        paypalOrderId: payment.paypal_order_id,
        captureId: capture.id,
      });
    } catch (error) {
      console.error('[get-orders] PayPal reconciliation failed for order', {
        orderId: order?.id,
        paypalOrderId: payment?.paypal_order_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const handler = async (event, context) => {
  const response = await legacyModule.handler(event, context);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode < 200 || statusCode >= 300 || !response?.body) return response;

  let orders;
  try {
    orders = JSON.parse(response.body);
  } catch {
    return response;
  }
  if (!Array.isArray(orders) || orders.length === 0) return response;

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return response;

  const ids = orders
    .map((order) => String(order?.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return response;

  try {
    const sql = neon(dbUrl);
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const paymentRows = await sql(
      `SELECT id::text AS id,
              total_cents,
              payment_method,
              paypal_order_id,
              paypal_capture_id,
              stripe_charge_id,
              stripe_payment_intent_id,
              to_jsonb(orders)->>'payment_reconciliation_status' AS payment_reconciliation_status,
              to_jsonb(orders)->>'confirmation_email_status' AS confirmation_email_status,
              to_jsonb(orders)->>'confirmation_emailed_at' AS confirmation_emailed_at,
              to_jsonb(orders)->>'admin_notification_status' AS admin_notification_status,
              to_jsonb(orders)->>'admin_notification_sent_at' AS admin_notification_sent_at,
              to_jsonb(orders)->>'production_email_status' AS production_email_status,
              to_jsonb(orders)->>'production_email_sent' AS production_email_sent,
              to_jsonb(orders)->>'production_email_sent_at' AS production_email_sent_at,
              to_jsonb(orders)->>'shipping_notification_status' AS shipping_notification_status,
              to_jsonb(orders)->>'shipping_notification_sent' AS shipping_notification_sent,
              to_jsonb(orders)->>'shipping_notification_sent_at' AS shipping_notification_sent_at
         FROM orders
        WHERE id::text IN (${placeholders})`,
      ids,
    );
    const paymentById = new Map(paymentRows.map((row) => [String(row.id), row]));

    await reconcilePendingPayPalOrders(sql, orders, paymentById);

    response.body = JSON.stringify(orders.map((order) => {
      const payment = paymentById.get(String(order.id));
      if (!payment) return order;

      const hasCompletedCapture = Boolean(
        payment.paypal_capture_id
        || payment.stripe_charge_id
        || payment.payment_reconciliation_status === 'complete',
      );
      const effectiveStatus = order.status === 'pending' && hasCompletedCapture
        ? 'paid'
        : order.status;

      return {
        ...order,
        status: effectiveStatus,
        payment_method: payment.payment_method || order.payment_method || null,
        paypal_order_id: payment.paypal_order_id || order.paypal_order_id || null,
        paypal_capture_id: payment.paypal_capture_id || order.paypal_capture_id || null,
        stripe_charge_id: payment.stripe_charge_id || order.stripe_charge_id || null,
        stripe_payment_intent_id: payment.stripe_payment_intent_id || order.stripe_payment_intent_id || null,
        payment_reconciliation_status: payment.payment_reconciliation_status || order.payment_reconciliation_status || null,
        confirmation_email_status: payment.confirmation_email_status || order.confirmation_email_status || null,
        confirmation_emailed_at: payment.confirmation_emailed_at || order.confirmation_emailed_at || null,
        admin_notification_status: payment.admin_notification_status || order.admin_notification_status || null,
        admin_notification_sent_at: payment.admin_notification_sent_at || order.admin_notification_sent_at || null,
        production_email_status: payment.production_email_status || order.production_email_status || null,
        production_email_sent: payment.production_email_sent === 'true' || order.production_email_sent === true,
        production_email_sent_at: payment.production_email_sent_at || order.production_email_sent_at || null,
        shipping_notification_status: payment.shipping_notification_status || order.shipping_notification_status || null,
        shipping_notification_sent: payment.shipping_notification_sent === 'true' || order.shipping_notification_sent === true,
        shipping_notification_sent_at: payment.shipping_notification_sent_at || order.shipping_notification_sent_at || null,
      };
    }));
  } catch (error) {
    console.error('[get-orders] metadata enrichment failed; returning base order response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
};

export const _test = { getCompletedCapture, amountToCents };
export default withLambda(handler);
