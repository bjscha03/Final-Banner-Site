'use strict';

const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');
const auth = require('../server-auth.cjs');
const creditPayments = require('../credit-paypal-service.cjs');

let neonFactory = neon;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

const DEFINITIVE_RESTART_CODES = new Set([
  'CREDIT_PAYMENT_ATTEMPT_RETIRED',
  'CREDIT_PAYPAL_ORDER_NOT_REUSABLE',
  'CREDIT_PAYPAL_ORDER_NOT_FOUND',
  'CREDIT_PAYPAL_CREATE_REJECTED',
]);

function errorResponse(error, identifiers = {}) {
  const statusCode = Number(error?.statusCode || 500);
  const restartPayment = !error?.paymentCaptured
    && DEFINITIVE_RESTART_CODES.has(String(error?.code || ''));
  return reply(statusCode, {
    ok: statusCode === 202,
    error: error?.code || 'CREDIT_ORDER_CREATE_FAILED',
    message: statusCode >= 500
      ? 'Credit checkout is temporarily unavailable. Please try again later.'
      : error?.message || 'Credit checkout could not be started.',
    paymentCaptured: Boolean(error?.paymentCaptured),
    paymentStatusUnknown: statusCode === 202,
    reconciliationRequired: statusCode === 202,
    doNotRetry: Boolean(error?.paymentCaptured),
    safeToRetry: statusCode === 202 && !error?.paymentCaptured,
    retryAllowed: restartPayment,
    restartPayment,
    ...(statusCode === 202 ? identifiers : {}),
  });
}

function assertLegacyFieldsDoNotConflict(payload, session, selectedPackage) {
  if (payload.userId != null && String(payload.userId) !== String(session.sub)) {
    throw new creditPayments.CreditPaymentError(
      'CREDIT_ACCOUNT_MISMATCH',
      'The signed-in account does not match this credit purchase.',
      { statusCode: 403 },
    );
  }
  const submittedEmail = creditPayments.normalizeEmail(payload.email);
  const sessionEmail = creditPayments.normalizeEmail(session.email);
  if (submittedEmail && submittedEmail !== sessionEmail) {
    throw new creditPayments.CreditPaymentError(
      'CREDIT_ACCOUNT_MISMATCH',
      'The signed-in account does not match this credit purchase.',
      { statusCode: 403 },
    );
  }
  if ((payload.credits != null && Number(payload.credits) !== selectedPackage.credits)
      || (payload.amountCents != null && Number(payload.amountCents) !== selectedPackage.amountCents)) {
    throw new creditPayments.CreditPaymentError(
      'CREDIT_PACKAGE_TAMPERED',
      'The submitted credit package does not match the server price.',
      { statusCode: 409 },
    );
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const session = auth.getSession(event);
  const sessionUserId = String(session?.sub || '').trim();
  const sessionEmail = creditPayments.normalizeEmail(session?.email);
  if (!sessionUserId || !sessionEmail) {
    return reply(401, {
      ok: false,
      error: 'CREDIT_AUTHENTICATION_REQUIRED',
      message: 'Sign in again before purchasing AI credits.',
    });
  }

  if (event.httpMethod === 'GET') {
    try {
      const config = creditPayments.getCreditPayPalConfig({ requireFeature: true });
      return reply(200, {
        ok: true,
        enabled: true,
        clientId: config.clientId,
        environment: config.environment,
        currency: 'USD',
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'INVALID_JSON' });
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });

  let checkoutKey = null;
  let purchase = null;
  try {
    const selectedPackage = creditPayments.resolveCreditPackage(payload.packageId);
    checkoutKey = creditPayments.validateCheckoutKey(payload.checkoutKey);
    assertLegacyFieldsDoNotConflict(payload, session, selectedPackage);
    // Check feature/environment credentials before persisting a new attempt, and
    // check schema before any PayPal request can leave this function.
    const config = creditPayments.getCreditPayPalConfig({ requireFeature: true });
    const sql = neonFactory(dbUrl);
    await creditPayments.ensureCreditPaymentSchema(sql);

    purchase = await creditPayments.createOrLoadPendingCreditPurchase(sql, {
      purchaseId: randomUUID(),
      userId: sessionUserId,
      email: sessionEmail,
      checkoutKey,
      selectedPackage,
    });

    if (purchase.status === 'failed') {
      const conflictFailure = purchase.last_error_code === 'CREDIT_PAYPAL_CREATE_IDENTITY_MISMATCH';
      throw new creditPayments.CreditPaymentError(
        conflictFailure ? 'CREDIT_PAYMENT_ATTEMPT_CONFLICT' : 'CREDIT_PAYMENT_ATTEMPT_RETIRED',
        conflictFailure
          ? 'This saved payment attempt requires reconciliation. Do not start another payment.'
          : 'This payment attempt ended. Start a new credit purchase.',
        { statusCode: 409 },
      );
    }

    const accessToken = await creditPayments.getPayPalAccessToken(config);
    if (purchase.paypal_order_id) {
      await creditPayments.assertCreditPayPalOrderOwnership(
        sql,
        purchase.paypal_order_id,
        purchase.id,
      );
      let existing;
      try {
        existing = await creditPayments.retrievePayPalOrder(
          config,
          accessToken,
          purchase.paypal_order_id,
        );
      } catch {
        existing = null;
      }
      if (!existing || (!existing.ok && existing.status !== 404)) {
        await creditPayments.markCreditReconciliation(sql, purchase.id, 'PAYPAL_CREATE_LOOKUP_UNKNOWN');
        throw new creditPayments.CreditPaymentError(
          'CREDIT_PAYMENT_STATUS_UNKNOWN',
          'We are confirming the previous PayPal attempt. No charge has been requested.',
          { statusCode: 202, retryable: true },
        );
      }
      if (existing.ok) {
        if (!creditPayments.matchesCreditPurchase(existing.data, purchase)) {
          throw new creditPayments.CreditPaymentError(
            'CREDIT_PAYPAL_IDENTITY_MISMATCH',
            'The stored PayPal order does not match this credit purchase.',
            { statusCode: 409 },
          );
        }
        const providerStatus = String(existing.data?.status || '').toUpperCase();
        if (creditPayments.ACTIVE_PAYPAL_ORDER_STATUSES.has(providerStatus)) {
          return reply(200, {
            ok: true,
            reused: true,
            orderID: purchase.paypal_order_id,
            purchaseId: purchase.id,
            checkoutKey,
            package: selectedPackage,
          });
        }
        const completed = creditPayments.validateCompletedCreditCapture(existing.data, purchase);
        if (completed.ok) {
          const settled = await creditPayments.settleVerifiedCapture(sql, purchase, completed);
          const notification = await creditPayments.processCreditPurchaseNotification(sql, purchase.id);
          return reply(200, {
            ok: true,
            alreadyCompleted: true,
            paymentCaptured: true,
            captureID: completed.captureId,
            orderID: purchase.paypal_order_id,
            purchaseId: purchase.id,
            purchase: settled.purchase,
            notificationComplete: notification.complete,
            package: selectedPackage,
          });
        }
        if (providerStatus === 'COMPLETED') {
          await creditPayments.markCreditReconciliation(sql, purchase.id, completed.code);
          throw new creditPayments.CreditPaymentError(
            'CREDIT_CAPTURE_RECONCILIATION_REQUIRED',
            'PayPal reports a completed payment that does not match this purchase. Do not pay again.',
            {
              statusCode: 202,
              retryable: true,
              paymentCaptured: true,
              captureId: completed.captureId || null,
            },
          );
        }
        throw new creditPayments.CreditPaymentError(
          'CREDIT_PAYPAL_ORDER_NOT_REUSABLE',
          'The prior PayPal attempt ended. Start a new credit purchase.',
          { statusCode: 409 },
        );
      }
      throw new creditPayments.CreditPaymentError(
        'CREDIT_PAYPAL_ORDER_NOT_FOUND',
        'The prior PayPal attempt is no longer available. Start a new credit purchase.',
        { statusCode: 409 },
      );
    }

    let providerResult;
    try {
      providerResult = await creditPayments.createPayPalCreditOrder(
        config,
        accessToken,
        purchase,
        selectedPackage,
      );
    } catch (error) {
      await creditPayments.markCreditReconciliation(sql, purchase.id, 'PAYPAL_CREATE_UNKNOWN');
      throw new creditPayments.CreditPaymentError(
        'CREDIT_PAYPAL_CREATE_UNKNOWN',
        'PayPal order creation is being confirmed. It is safe to retry this same checkout.',
        { statusCode: 202, retryable: true },
      );
    }

    const providerStatus = String(providerResult.data?.status || '').toUpperCase();
    const creationValid = providerResult.ok
      && Boolean(providerResult.data?.id)
      && creditPayments.ACTIVE_PAYPAL_ORDER_STATUSES.has(providerStatus)
      && creditPayments.matchesCreditPurchase(providerResult.data, purchase);
    if (!creationValid) {
      const ambiguous = Number(providerResult.status) >= 500;
      if (ambiguous) {
        await creditPayments.markCreditReconciliation(sql, purchase.id, `PAYPAL_CREATE_${providerResult.status}`);
        throw new creditPayments.CreditPaymentError(
          'CREDIT_PAYPAL_CREATE_UNKNOWN',
          'PayPal order creation is being confirmed. It is safe to retry this same checkout.',
          { statusCode: 202, retryable: true },
        );
      }
      await creditPayments.markCreditFailed(
        sql,
        purchase.id,
        providerResult.ok ? 'CREDIT_PAYPAL_CREATE_IDENTITY_MISMATCH' : 'PAYPAL_CREATE_REJECTED',
      );
      throw new creditPayments.CreditPaymentError(
        providerResult.ok ? 'CREDIT_PAYPAL_CREATE_IDENTITY_MISMATCH' : 'CREDIT_PAYPAL_CREATE_REJECTED',
        'PayPal could not start this credit purchase. Start a new payment attempt.',
        { statusCode: providerResult.ok ? 409 : 502 },
      );
    }

    await creditPayments.assertCreditPayPalOrderOwnership(
      sql,
      providerResult.data.id,
      purchase.id,
    );
    purchase = await creditPayments.attachPayPalOrder(sql, purchase, providerResult.data.id);
    return reply(200, {
      ok: true,
      orderID: purchase.paypal_order_id,
      purchaseId: purchase.id,
      checkoutKey,
      package: selectedPackage,
    });
  } catch (error) {
    console.error('[paypal-create-credits-order] failed', {
      code: error?.code || null,
      statusCode: error?.statusCode || 500,
      message: error?.message,
    });
    return errorResponse(error, {
      purchaseId: purchase?.id || null,
      checkoutKey,
    });
  }
};

exports._test = {
  assertLegacyFieldsDoNotConflict,
  errorResponse,
  resetNeonFactory() {
    neonFactory = neon;
  },
  setNeonFactory(factory) {
    neonFactory = factory;
  },
};
