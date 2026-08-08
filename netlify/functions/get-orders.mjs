import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-orders.cjs';
import visibilityModule from './_shared/admin-order-visibility.cjs';
import paypalCaptureModule from './_shared/legacy/paypal-capture-forward.cjs';
import checkoutModule from './_shared/stripe-checkout-service.cjs';

const {
  hasCompletedPayPalPaymentEvidence,
  isAdminVisiblePaidOrder,
} = visibilityModule;

const PAGE_SIZE = 20;
const MAX_ADMIN_SCAN_PAGES = 5000;

const parseOrders = (response) => {
  if (!response?.body) return null;
  try {
    const parsed = JSON.parse(response.body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const fetchLegacyOrdersPage = (event, context, page) => legacyModule.handler({
  ...event,
  queryStringParameters: {
    ...(event?.queryStringParameters || {}),
    page: String(page),
  },
}, context);

async function reconcilePendingPayPalOrders(sql, orders, paymentById, event = {}) {
  const candidates = orders
    .map((order) => ({ order, payment: paymentById.get(String(order?.id)) }))
    .filter(({ order, payment }) => (
      String(order?.status || '').toLowerCase() === 'pending'
      && payment?.paypal_order_id
      && !payment?.paypal_capture_id
      && String(payment?.payment_method || '').toLowerCase() === 'paypal'
      && !payment?.stripe_payment_intent_id
      && String(payment?.payment_reconciliation_status || '').toLowerCase() !== 'complete'
    ));

  if (!candidates.length) return;

  for (const { order, payment } of candidates) {
    try {
      const response = await paypalCaptureModule.handler({
        httpMethod: 'POST',
        headers: event?.headers || {},
        body: JSON.stringify({
          orderID: payment.paypal_order_id,
          internalOrderId: order.id,
          checkoutKey: payment.checkout_idempotency_key,
          reconcileOnly: true,
        }),
      });
      let payload = {};
      try { payload = JSON.parse(response?.body || '{}'); } catch { /* handled below */ }
      if (Number(response?.statusCode || 500) !== 200
          || payload?.paymentCaptured !== true
          || payload?.captureStatus !== 'COMPLETED'
          || !payload?.captureID) {
        continue;
      }

      payment.paypal_capture_id = payload.captureID;
      payment.payment_reconciliation_status = 'complete';
      payment.payment_method = 'paypal';
      order.status = 'paid';
      const followupsQueued = await checkoutModule.queuePaidOrderFollowups(event, order.id);
      console.log('[get-orders] Reconciled completed PayPal payment for Admin', {
        orderId: order.id,
        paypalOrderId: payment.paypal_order_id,
        captureId: payload.captureID,
        followupsQueued,
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

async function enrichOrderPaymentMetadata(sql, orders, options = {}) {
  if (!orders.length) return orders;

  const ids = orders
    .map((order) => String(order?.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return orders;

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const paymentRows = await sql(
    `SELECT orders.id::text AS id,
            orders.total_cents,
            orders.payment_method,
            orders.paypal_order_id,
            orders.paypal_capture_id,
            orders.stripe_payment_intent_id,
            orders.stripe_charge_id,
            orders.stripe_wallet_type,
            orders.checkout_idempotency_key,
            orders.is_test_order,
            orders.test_order_reason,
            CASE
              WHEN TRIM(COALESCE(orders.email, '')) ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
                THEN LOWER(TRIM(orders.email))
              WHEN TRIM(COALESCE(profiles.email, '')) ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
                THEN LOWER(TRIM(profiles.email))
              ELSE NULL
            END AS review_request_customer_email,
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
       LEFT JOIN profiles ON orders.user_id = profiles.id
      WHERE orders.id::text IN (${placeholders})`,
    ids,
  );
  const paymentById = new Map(paymentRows.map((row) => [String(row.id), row]));

  // Review-request history is intentionally isolated from the orders table.
  // If migration 020 has not run yet, keep the admin list available and show
  // no prior-send metadata until the migration or first endpoint call creates it.
  let reviewById = new Map();
  try {
    const reviewRows = await sql(
      `SELECT order_id::text AS order_id,
              MAX(sent_at) AS last_sent_at,
              COUNT(*)::int AS sent_count
         FROM review_request_history
        WHERE status = 'sent'
          AND order_id::text IN (${placeholders})
        GROUP BY order_id`,
      ids,
    );
    reviewById = new Map(reviewRows.map((row) => [String(row.order_id), row]));
  } catch (error) {
    if (String(error?.code || '') !== '42P01') {
      console.warn('[get-orders] review-request metadata unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await reconcilePendingPayPalOrders(sql, orders, paymentById, options.event || {});

  return orders.map((order) => {
    const payment = paymentById.get(String(order.id));
    const review = reviewById.get(String(order.id));
    if (!payment) return order;

    const combinedPaymentState = {
      ...order,
      ...payment,
    };
    const effectiveStatus = String(order.status || '').toLowerCase() === 'pending'
      && hasCompletedPayPalPaymentEvidence(combinedPaymentState)
      ? 'paid'
      : order.status;

    return {
      ...order,
      status: effectiveStatus,
      payment_method: payment.payment_method || order.payment_method || null,
      paypal_order_id: payment.paypal_order_id || order.paypal_order_id || null,
      paypal_capture_id: payment.paypal_capture_id || order.paypal_capture_id || null,
      ...(options.includeStripeReferences ? {
        stripe_payment_intent_id: payment.stripe_payment_intent_id || order.stripe_payment_intent_id || null,
        stripe_charge_id: payment.stripe_charge_id || order.stripe_charge_id || null,
      } : {}),
      stripe_wallet_type: payment.stripe_wallet_type || order.stripe_wallet_type || null,
      is_test_order: payment.is_test_order === true || payment.is_test_order === 'true' || order.is_test_order === true,
      test_order_reason: payment.test_order_reason || order.test_order_reason || null,
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
      review_request_customer_email: payment.review_request_customer_email || order.email || null,
      review_request_last_sent_at: review?.last_sent_at || null,
      review_request_sent_count: Number(review?.sent_count || 0),
    };
  });
}

async function loadAdminPaidPage(event, context, sql, requestedPage) {
  const targetEnd = requestedPage * PAGE_SIZE;
  const targetStart = targetEnd - PAGE_SIZE;
  const visibleOrders = [];
  const seenOrderIds = new Set();
  let responseTemplate = null;

  for (let legacyPage = 1; legacyPage <= MAX_ADMIN_SCAN_PAGES; legacyPage += 1) {
    const legacyResponse = await fetchLegacyOrdersPage(event, context, legacyPage);
    responseTemplate ||= legacyResponse;

    const statusCode = Number(legacyResponse?.statusCode || 500);
    if (statusCode < 200 || statusCode >= 300) return legacyResponse;

    const rawOrders = parseOrders(legacyResponse);
    if (!rawOrders || rawOrders.length === 0) break;

    let enrichedOrders = rawOrders;
    if (sql) {
      try {
        enrichedOrders = await enrichOrderPaymentMetadata(sql, rawOrders, {
          includeStripeReferences: true,
          event,
        });
      } catch (error) {
        // Fail closed for Admin: if payment metadata cannot be verified, only
        // canonical paid lifecycle statuses survive the visibility filter.
        console.error('[get-orders] payment enrichment failed for Admin page', {
          legacyPage,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const order of enrichedOrders) {
      if (!isAdminVisiblePaidOrder(order)) continue;
      const orderId = String(order?.id || '').trim();
      if (!orderId || seenOrderIds.has(orderId)) continue;
      seenOrderIds.add(orderId);
      visibleOrders.push(order);
    }

    if (visibleOrders.length >= targetEnd) break;
    if (rawOrders.length < PAGE_SIZE) break;
  }

  const pageOrders = visibleOrders.slice(targetStart, targetEnd);
  return {
    ...(responseTemplate || { statusCode: 200, headers: {} }),
    statusCode: 200,
    body: JSON.stringify(pageOrders),
  };
}

const handler = async (event, context) => {
  const query = event?.queryStringParameters || {};
  const userId = String(query.user_id || '').trim();
  const requestedPage = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const isAdminListRequest = !userId;
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  const sql = dbUrl ? neon(dbUrl) : null;

  if (isAdminListRequest) {
    return loadAdminPaidPage(event, context, sql, requestedPage);
  }

  const response = await fetchLegacyOrdersPage(event, context, requestedPage);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode < 200 || statusCode >= 300) return response;

  const orders = parseOrders(response);
  if (!orders || orders.length === 0 || !sql) return response;

  try {
    response.body = JSON.stringify(await enrichOrderPaymentMetadata(sql, orders));
  } catch (error) {
    console.error('[get-orders] metadata enrichment failed; returning base user order response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
};

export const _test = { getCompletedCapture, amountToCents, parseOrders };
export default withLambda(handler);
