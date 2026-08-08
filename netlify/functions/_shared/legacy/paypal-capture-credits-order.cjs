'use strict';

const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const auth = require('../server-auth.cjs');
const creditPayments = require('../credit-paypal-service.cjs');

let neonFactory = neon;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function successPayload(result, notification = null) {
  const purchase = result.purchase;
  return {
    ok: true,
    success: true,
    paymentCaptured: true,
    paymentStatusUnknown: false,
    reconciliationRequired: false,
    doNotRetry: false,
    alreadyCompleted: !result.newlyFulfilled,
    notificationComplete: notification?.complete === true,
    purchaseId: purchase.id,
    orderID: purchase.paypal_order_id,
    captureID: result.validation.captureId,
    credits: Number(purchase.credits_purchased),
    amountCents: Number(purchase.amount_cents),
    currency: 'USD',
    packageId: purchase.package_key,
    paidCreditsBalance: result.purchase.paid_credits_balance == null
      ? null
      : Number(result.purchase.paid_credits_balance),
    purchase: {
      id: purchase.id,
      email: purchase.email,
      credits_purchased: Number(purchase.credits_purchased),
      amount_cents: Number(purchase.amount_cents),
      paypal_order_id: purchase.paypal_order_id,
      paypal_capture_id: result.validation.captureId,
      status: 'completed',
      created_at: purchase.created_at,
      completed_at: purchase.completed_at || null,
    },
  };
}

function errorResponse(error, identifiers = {}) {
  const statusCode = Number(error?.statusCode || 500);
  if (statusCode === 202) {
    return reply(202, {
      ok: true,
      success: false,
      paymentCaptured: Boolean(error?.paymentCaptured),
      paymentStatusUnknown: true,
      reconciliationRequired: true,
      doNotRetry: true,
      retryAfterMs: 2000,
      error: error?.code || 'CREDIT_PAYMENT_STATUS_UNKNOWN',
      message: error?.message || 'We are confirming this payment. Do not submit another payment.',
      captureID: error?.captureId || null,
      ...identifiers,
      captureRequestStarted: error?.details?.captureRequestStarted
        ?? identifiers.captureRequestStarted
        ?? false,
    });
  }
  const restartPayment = statusCode === 422 && !error?.paymentCaptured;
  return reply(statusCode, {
    ok: false,
    success: false,
    paymentCaptured: Boolean(error?.paymentCaptured),
    paymentStatusUnknown: false,
    reconciliationRequired: false,
    doNotRetry: !restartPayment,
    retryAllowed: restartPayment,
    restartPayment,
    error: error?.code || 'CREDIT_PAYMENT_FAILED',
    message: statusCode >= 500
      ? 'Credit payment verification is temporarily unavailable.'
      : error?.message || 'The credit payment could not be completed.',
    ...identifiers,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  const session = auth.getSession(event);
  const sessionUserId = String(session?.sub || '').trim();
  if (!sessionUserId || !creditPayments.normalizeEmail(session?.email)) {
    return reply(401, {
      ok: false,
      error: 'CREDIT_AUTHENTICATION_REQUIRED',
      message: 'Sign in again before completing this credit purchase.',
    });
  }

  let input;
  let purchase = null;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'INVALID_JSON' });
  }

  const purchaseId = String(input.purchaseId || '').trim();
  const orderID = String(input.orderID || '').trim();
  const checkoutKey = String(input.checkoutKey || '').trim();
  const reconcileOnly = input.reconcileOnly === true;
  if (!purchaseId || !orderID || !checkoutKey) {
    return reply(400, { ok: false, error: 'CREDIT_PAYMENT_IDENTIFIERS_REQUIRED' });
  }
  if (input.userId != null && String(input.userId) !== sessionUserId) {
    return reply(403, { ok: false, error: 'CREDIT_ACCOUNT_MISMATCH' });
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const sql = neonFactory(dbUrl);

  try {
    // Both checks happen before OAuth/retrieve/capture. A missing migration,
    // duplicate historical provider ID, disabled feature, or live/preview key
    // mismatch therefore fails without touching PayPal.
    creditPayments.validateCheckoutKey(checkoutKey);
    creditPayments.getCreditPayPalConfig({ requireFeature: !reconcileOnly });
    await creditPayments.ensureCreditPaymentSchema(sql);
    purchase = await creditPayments.loadCreditPurchaseById(sql, purchaseId, sessionUserId);
    if (!purchase) {
      throw new creditPayments.CreditPaymentError(
        'CREDIT_PURCHASE_NOT_FOUND',
        'This credit purchase was not found for the signed-in account.',
        { statusCode: 404 },
      );
    }
    if (!constantTimeEqual(checkoutKey, purchase.checkout_idempotency_key)) {
      throw new creditPayments.CreditPaymentError(
        'CREDIT_CHECKOUT_CONFIRMATION_REQUIRED',
        'This browser is not authorized to complete the credit purchase.',
        { statusCode: 401 },
      );
    }
    if (purchase.paypal_order_id !== orderID) {
      throw new creditPayments.CreditPaymentError(
        'CREDIT_PAYPAL_ORDER_LINK_MISMATCH',
        'This PayPal order is not bound to the requested credit purchase.',
        { statusCode: 409 },
      );
    }
    await creditPayments.assertCreditPayPalOrderOwnership(sql, orderID, purchase.id);

    const result = await creditPayments.reconcileCreditPayment({
      sql,
      purchase,
      paypalOrderId: orderID,
      captureIfApproved: !reconcileOnly,
      reconcileOnly,
      requireFeature: !reconcileOnly,
    });
    const notification = await creditPayments.processCreditPurchaseNotification(sql, purchase.id);
    return reply(200, successPayload(result, notification));
  } catch (error) {
    console.error('[paypal-capture-credits-order] failed', {
      purchaseId,
      orderID,
      code: error?.code || null,
      statusCode: error?.statusCode || 500,
      paymentCaptured: Boolean(error?.paymentCaptured),
      message: error?.message,
    });
    return errorResponse(error, {
      purchaseId,
      orderID,
      captureRequestStarted: purchase?.paypal_capture_request_id
        === creditPayments.creditCaptureRequestId(purchaseId),
    });
  }
};

exports._test = {
  constantTimeEqual,
  errorResponse,
  successPayload,
  resetNeonFactory() {
    neonFactory = neon;
  },
  setNeonFactory(factory) {
    neonFactory = factory;
  },
};
