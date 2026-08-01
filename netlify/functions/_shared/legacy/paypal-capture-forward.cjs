const { neon } = require('@neondatabase/serverless');
const { amountToCents } = require('../paypalConversionHelpers.cjs');
const {
  captureFromOrder,
  matchesInternalOrder,
  orderIdentity,
  recordAttempt,
} = require('./paypal-payment-safety.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const RESTARTABLE_PROVIDER_CODES = new Set([
  'INSTRUMENT_DECLINED',
  'PAYER_ACTION_REQUIRED',
]);

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEmail(value) {
  const email = firstNonEmpty(value)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/^guest-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
  if (email === 'guest@example.com') return null;
  return email;
}

function extractCustomerEmail(paypalData) {
  if (!paypalData || typeof paypalData !== 'object') return null;
  const paymentSource = paypalData.payment_source || {};
  const candidates = [
    paypalData.payer?.email_address,
    paymentSource.paypal?.email_address,
    paymentSource.card?.attributes?.customer?.email_address,
    paymentSource.card?.email_address,
    paymentSource.apple_pay?.email_address,
    paymentSource.google_pay?.email_address,
    ...(Array.isArray(paypalData.purchase_units)
      ? paypalData.purchase_units.map((unit) => unit?.shipping?.email_address)
      : []),
  ];
  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (email) return email;
  }
  return null;
}

function joinName(name) {
  if (!name || typeof name !== 'object') return null;
  return firstNonEmpty(
    name.full_name,
    [name.given_name, name.surname].filter(Boolean).join(' '),
  );
}

function extractShippingAddress(paypalData) {
  if (!paypalData || typeof paypalData !== 'object') return null;
  const purchaseUnit = Array.isArray(paypalData.purchase_units)
    ? paypalData.purchase_units.find((unit) => unit?.shipping) || paypalData.purchase_units[0]
    : null;
  const shipping = purchaseUnit?.shipping || null;
  const payer = paypalData.payer || null;
  const paymentSource = paypalData.payment_source || {};
  const card = paymentSource.card || null;
  const paypal = paymentSource.paypal || null;
  const applePay = paymentSource.apple_pay || null;
  const googlePay = paymentSource.google_pay || null;
  const address = shipping?.address
    || payer?.address
    || card?.billing_address
    || applePay?.card?.billing_address
    || googlePay?.card?.billing_address
    || {};
  const name = firstNonEmpty(
    joinName(shipping?.name),
    joinName(paypal?.name),
    card?.name,
    joinName(card?.attributes?.customer?.name),
    applePay?.name,
    googlePay?.name,
    joinName(payer?.name),
  );
  const street = firstNonEmpty(address.address_line_1, address.line1, address.street);
  const street2 = firstNonEmpty(address.address_line_2, address.line2, address.street2);
  const city = firstNonEmpty(address.admin_area_2, address.city);
  const state = firstNonEmpty(address.admin_area_1, address.state, address.region);
  const zip = firstNonEmpty(address.postal_code, address.zip);
  const country = firstNonEmpty(address.country_code, address.country) || 'US';
  if (!(name || street || street2 || city || state || zip || country)) return null;
  return { name, street, street2, city, state, zip, country };
}

function providerIssue(payload) {
  const details = Array.isArray(payload?.details) ? payload.details : [];
  return firstNonEmpty(
    details.find((detail) => detail?.issue)?.issue,
    payload?.name,
  );
}

function allCaptures(order) {
  return Array.isArray(order?.purchase_units)
    ? order.purchase_units.flatMap((unit) => unit?.payments?.captures || [])
    : [];
}

function failedCaptureFromOrder(order) {
  return allCaptures(order).find((capture) => ['DECLINED', 'FAILED'].includes(String(capture?.status || '').toUpperCase())) || null;
}

function getPayPalConfig() {
  const env = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  if (!clientId || !secret) throw new Error('PAYPAL_NOT_CONFIGURED');
  return {
    env,
    clientId,
    secret,
    baseUrl: env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

async function getPayPalAccessToken(config) {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en_US',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PAYPAL_AUTH_FAILED_${response.status}`);
  return (await response.json()).access_token;
}

async function retrievePayPalOrder(config, accessToken, orderID) {
  const response = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function safeRecordAttempt(sql, attempt) {
  try {
    await recordAttempt(sql, attempt);
  } catch (error) {
    console.error('[paypal-capture] payment attempt ledger write failed', {
      internalOrderId: attempt.internalOrderId,
      paypalOrderId: attempt.paypalOrderId,
      captureId: attempt.captureId,
      error: error?.message,
    });
  }
}

async function markReconciliationRequired(sql, internalOrderId, reason) {
  try {
    await sql`
      UPDATE orders
         SET payment_reconciliation_status = 'required', updated_at = NOW()
       WHERE id = ${internalOrderId}
    `;
  } catch (error) {
    console.error('[paypal-capture] could not mark reconciliation required', {
      internalOrderId,
      reason,
      error: error?.message,
    });
  }
}

function verificationPayload(orderID, internalOrderId, message) {
  return {
    ok: true,
    success: false,
    paymentCaptured: false,
    paymentStatusUnknown: true,
    reconciliationRequired: true,
    doNotRetry: true,
    paypalOrderID: orderID,
    orderID,
    internalOrderId,
    message: message || 'We are confirming your payment. Do not submit another payment.',
  };
}

function definitiveFailurePayload(orderID, internalOrderId, code, message) {
  return {
    ok: false,
    success: false,
    paymentCaptured: false,
    reconciliationRequired: false,
    doNotRetry: false,
    restartPayment: RESTARTABLE_PROVIDER_CODES.has(code),
    providerCode: code,
    error: code || 'PAYPAL_PAYMENT_DECLINED',
    paypalOrderID: orderID,
    orderID,
    internalOrderId,
    message: message || 'Your payment method was declined. Choose another card or payment method and try again.',
  };
}

function validateCompletedCapture(paypalData, expectedTotalCents) {
  const completed = captureFromOrder(paypalData);
  const orderStatus = String(paypalData?.status || '').toUpperCase();
  const captureStatus = String(completed?.status || '').toUpperCase();
  const captureId = String(completed?.id || '').trim();
  const currency = String(completed?.amount?.currency_code || '').toUpperCase();
  const capturedAmountCents = amountToCents(completed?.amount?.value);

  if (!captureId || captureStatus !== 'COMPLETED') {
    return { ok: false, code: 'PAYPAL_CAPTURE_NOT_COMPLETED', orderStatus, captureStatus, captureId, currency, amountCents: capturedAmountCents };
  }
  if (currency !== 'USD') {
    return { ok: false, code: 'PAYPAL_CAPTURE_CURRENCY_MISMATCH', orderStatus, captureStatus, captureId, currency, amountCents: capturedAmountCents };
  }
  if (!Number.isInteger(capturedAmountCents) || capturedAmountCents <= 0) {
    return { ok: false, code: 'PAYPAL_CAPTURE_AMOUNT_INVALID', orderStatus, captureStatus, captureId, currency, amountCents: capturedAmountCents };
  }
  if (Number(expectedTotalCents) !== capturedAmountCents) {
    return {
      ok: false,
      code: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH',
      orderStatus,
      captureStatus,
      captureId,
      currency,
      amountCents: capturedAmountCents,
      expectedCents: Number(expectedTotalCents),
    };
  }
  return {
    ok: true,
    orderStatus: orderStatus || 'COMPLETED',
    captureStatus,
    captureId,
    currency,
    amountCents: capturedAmountCents,
    capture: completed,
  };
}

function successPayload({ orderID, internalOrderId, validation, environment, paypalData, shippingAddress, persistedOrder, alreadyPaid }) {
  return {
    ok: true,
    success: true,
    alreadyPaid: Boolean(alreadyPaid),
    paymentCaptured: true,
    reconciliationRequired: false,
    doNotRetry: false,
    paypalOrderID: orderID,
    orderID,
    captureID: validation.captureId,
    status: 'COMPLETED',
    captureStatus: 'COMPLETED',
    capturedAmountCents: validation.amountCents,
    capturedCurrency: validation.currency,
    environment,
    paypalData,
    shippingAddress,
    customerEmail: normalizeEmail(persistedOrder?.email),
    customerName: persistedOrder?.customer_name || persistedOrder?.shipping_name || shippingAddress?.name || null,
    internalOrderId,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  if (process.env.FEATURE_PAYPAL !== '1') {
    return reply(503, {
      ok: false,
      error: 'PAYPAL_DISABLED',
      message: 'PayPal payments are temporarily unavailable.',
    });
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'INVALID_JSON' });
  }

  const orderID = String(input.orderID || '').trim();
  const internalOrderId = String(input.internalOrderId || '').trim();
  if (!orderID || !internalOrderId) {
    return reply(400, { ok: false, error: 'ORDER_IDENTIFIERS_REQUIRED' });
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });

  let verifiedCapture = null;
  let paypalData = null;
  let shippingAddress = null;
  let paypalConfig = null;
  let order = null;

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT id, status, total_cents, currency, email, customer_name, customer_first_name,
             shipping_name, shipping_street, shipping_street2, shipping_city,
             shipping_state, shipping_zip, shipping_country,
             paypal_order_id, paypal_capture_id, checkout_idempotency_key
        FROM orders
       WHERE id = ${internalOrderId}
       LIMIT 1
    `;
    if (!rows.length) return reply(404, { ok: false, error: 'INTERNAL_ORDER_NOT_FOUND' });
    order = rows[0];

    if (order.paypal_order_id !== orderID) {
      await safeRecordAttempt(sql, {
        internalOrderId,
        checkoutKey: order.checkout_idempotency_key,
        paypalOrderId: orderID,
        source: 'capture',
        processingStatus: 'rejected_before_capture',
        duplicateSuspected: true,
        errorCode: 'PAYPAL_ORDER_LINK_MISMATCH',
      });
      return reply(409, { ok: false, error: 'PAYPAL_ORDER_LINK_MISMATCH' });
    }

    if (!['pending', 'paid'].includes(order.status)) {
      return reply(409, { ok: false, error: 'INTERNAL_ORDER_NOT_PAYABLE' });
    }

    if (order.status === 'paid') {
      if (!order.paypal_capture_id) {
        await markReconciliationRequired(sql, internalOrderId, 'paid_without_capture');
        return reply(202, verificationPayload(orderID, internalOrderId));
      }
      const existingAddress = {
        name: order.shipping_name || order.customer_name || null,
        street: order.shipping_street || null,
        street2: order.shipping_street2 || null,
        city: order.shipping_city || null,
        state: order.shipping_state || null,
        zip: order.shipping_zip || null,
        country: order.shipping_country || 'US',
      };
      return reply(200, successPayload({
        orderID,
        internalOrderId,
        validation: {
          captureId: order.paypal_capture_id,
          amountCents: Number(order.total_cents),
          currency: 'USD',
        },
        environment: process.env.PAYPAL_ENV || 'sandbox',
        paypalData: null,
        shippingAddress: existingAddress,
        persistedOrder: order,
        alreadyPaid: true,
      }));
    }

    paypalConfig = getPayPalConfig();
    const accessToken = await getPayPalAccessToken(paypalConfig);
    const originalResult = await retrievePayPalOrder(paypalConfig, accessToken, orderID);

    if (!originalResult.ok) {
      await markReconciliationRequired(sql, internalOrderId, `retrieve_${originalResult.status}`);
      await safeRecordAttempt(sql, {
        internalOrderId,
        checkoutKey: order.checkout_idempotency_key,
        paypalOrderId: orderID,
        source: 'reconciliation',
        processingStatus: 'required',
        errorCode: 'PAYPAL_ORDER_UNAVAILABLE',
        errorMessage: `PayPal order lookup returned ${originalResult.status}`,
        raw: originalResult.data,
      });
      return reply(202, verificationPayload(orderID, internalOrderId));
    }

    const originalOrder = originalResult.data;
    const identity = orderIdentity(originalOrder);
    if (!matchesInternalOrder(originalOrder, order)) {
      await safeRecordAttempt(sql, {
        internalOrderId,
        checkoutKey: order.checkout_idempotency_key,
        paypalOrderId: orderID,
        source: 'capture',
        orderStatus: originalOrder?.status,
        amountCents: identity.amountCents,
        currency: identity.currency,
        invoiceId: identity.invoiceId,
        customId: identity.customId,
        processingStatus: 'rejected_before_capture',
        duplicateSuspected: true,
        errorCode: identity.currency !== 'USD' || identity.amountCents !== Number(order.total_cents)
          ? 'PAYPAL_AMOUNT_MISMATCH'
          : 'PAYPAL_ORDER_IDENTITY_MISMATCH',
        raw: originalOrder,
      });
      return reply(409, {
        ok: false,
        error: identity.currency !== 'USD' || identity.amountCents !== Number(order.total_cents)
          ? 'PAYPAL_AMOUNT_MISMATCH'
          : 'PAYPAL_ORDER_IDENTITY_MISMATCH',
      });
    }

    paypalData = originalOrder;
    let completed = captureFromOrder(paypalData);
    const existingFailed = failedCaptureFromOrder(paypalData);
    if (!completed && existingFailed) {
      const code = firstNonEmpty(existingFailed.status_details?.reason, 'PAYPAL_PAYMENT_DECLINED');
      await safeRecordAttempt(sql, {
        internalOrderId,
        checkoutKey: order.checkout_idempotency_key,
        paypalOrderId: orderID,
        captureId: existingFailed.id,
        source: 'capture',
        captureStatus: existingFailed.status,
        processingStatus: 'declined',
        errorCode: code,
        raw: paypalData,
      });
      return reply(422, definitiveFailurePayload(orderID, internalOrderId, code));
    }

    if (!completed) {
      let captureResponse = null;
      let captureBody = {};
      let captureError = null;
      try {
        captureResponse = await fetch(`${paypalConfig.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `capture-${orderID}`,
            Prefer: 'return=representation',
          },
        });
        captureBody = await captureResponse.json().catch(() => ({}));
      } catch (error) {
        captureError = error;
        console.error('[paypal-capture] capture request threw; checking PayPal before responding', {
          internalOrderId,
          orderID,
          error: error?.message,
        });
      }

      if (captureResponse?.ok && captureFromOrder(captureBody)) {
        paypalData = captureBody;
        completed = captureFromOrder(paypalData);
      } else {
        const recovered = await retrievePayPalOrder(paypalConfig, accessToken, orderID);
        if (recovered.ok && captureFromOrder(recovered.data)) {
          paypalData = recovered.data;
          completed = captureFromOrder(paypalData);
        } else {
          const recoveredFailure = recovered.ok ? failedCaptureFromOrder(recovered.data) : null;
          const issue = providerIssue(captureBody);
          if (recoveredFailure) {
            const code = firstNonEmpty(recoveredFailure.status_details?.reason, issue, 'PAYPAL_PAYMENT_DECLINED');
            await safeRecordAttempt(sql, {
              internalOrderId,
              checkoutKey: order.checkout_idempotency_key,
              paypalOrderId: orderID,
              captureId: recoveredFailure.id,
              requestId: `capture-${orderID}`,
              source: 'capture',
              captureStatus: recoveredFailure.status,
              processingStatus: 'declined',
              errorCode: code,
              raw: recovered.data,
            });
            return reply(422, definitiveFailurePayload(orderID, internalOrderId, code));
          }

          if (RESTARTABLE_PROVIDER_CODES.has(issue)) {
            await safeRecordAttempt(sql, {
              internalOrderId,
              checkoutKey: order.checkout_idempotency_key,
              paypalOrderId: orderID,
              requestId: `capture-${orderID}`,
              source: 'capture',
              processingStatus: 'declined',
              errorCode: issue,
              errorMessage: captureBody?.message,
              raw: captureBody,
            });
            return reply(422, definitiveFailurePayload(orderID, internalOrderId, issue));
          }

          await markReconciliationRequired(sql, internalOrderId, issue || captureError?.message || `capture_${captureResponse?.status || 'network'}`);
          await safeRecordAttempt(sql, {
            internalOrderId,
            checkoutKey: order.checkout_idempotency_key,
            paypalOrderId: orderID,
            requestId: `capture-${orderID}`,
            source: 'reconciliation',
            processingStatus: 'required',
            errorCode: issue || 'PAYPAL_CAPTURE_STATUS_UNKNOWN',
            errorMessage: captureBody?.message || captureError?.message,
            raw: captureBody,
          });
          return reply(202, verificationPayload(orderID, internalOrderId));
        }
      }
    }

    verifiedCapture = validateCompletedCapture(paypalData, order.total_cents);
    if (!verifiedCapture.ok) {
      await markReconciliationRequired(sql, internalOrderId, verifiedCapture.code);
      return reply(202, verificationPayload(orderID, internalOrderId));
    }

    shippingAddress = extractShippingAddress(paypalData) || extractShippingAddress(originalOrder);
    const payerEmail = extractCustomerEmail(paypalData) || extractCustomerEmail(originalOrder);
    const firstName = shippingAddress?.name ? String(shippingAddress.name).trim().split(/\s+/)[0] : null;

    await safeRecordAttempt(sql, {
      internalOrderId,
      checkoutKey: order.checkout_idempotency_key,
      paypalOrderId: orderID,
      captureId: verifiedCapture.captureId,
      requestId: `capture-${orderID}`,
      source: 'capture',
      orderStatus: verifiedCapture.orderStatus,
      captureStatus: verifiedCapture.captureStatus,
      amountCents: verifiedCapture.amountCents,
      currency: verifiedCapture.currency,
      payerEmail,
      payerId: paypalData?.payer?.payer_id || originalOrder?.payer?.payer_id,
      invoiceId: identity.invoiceId,
      customId: identity.customId,
      processingStatus: 'captured',
      raw: paypalData,
    });

    const paidRows = await sql`
      UPDATE orders SET
        status = 'paid',
        paypal_capture_id = ${verifiedCapture.captureId},
        payment_method = 'paypal',
        payment_reconciliation_status = 'complete',
        email = CASE
          WHEN ${payerEmail || null} IS NOT NULL
           AND (email IS NULL OR BTRIM(email) = '' OR email ILIKE 'guest-%@bannersonthefly.com' OR LOWER(email) = 'guest@example.com')
          THEN ${payerEmail || null}
          ELSE email
        END,
        customer_name = COALESCE(${shippingAddress?.name || null}, NULLIF(customer_name, '')),
        customer_first_name = COALESCE(${firstName}, NULLIF(customer_first_name, '')),
        shipping_name = COALESCE(${shippingAddress?.name || null}, shipping_name),
        shipping_street = COALESCE(${shippingAddress?.street || null}, shipping_street),
        shipping_street2 = COALESCE(${shippingAddress?.street2 || null}, shipping_street2),
        shipping_city = COALESCE(${shippingAddress?.city || null}, shipping_city),
        shipping_state = COALESCE(${shippingAddress?.state || null}, shipping_state),
        shipping_zip = COALESCE(${shippingAddress?.zip || null}, shipping_zip),
        shipping_country = COALESCE(${shippingAddress?.country || null}, shipping_country),
        updated_at = NOW()
      WHERE id = ${internalOrderId}
        AND status = 'pending'
        AND paypal_order_id = ${orderID}
        AND total_cents = ${verifiedCapture.amountCents}
        AND paypal_capture_id IS NULL
      RETURNING id, status, email, customer_name, customer_first_name,
                shipping_name, shipping_street, shipping_street2, shipping_city,
                shipping_state, shipping_zip, shipping_country,
                paypal_order_id, paypal_capture_id
    `;

    let persistedOrder = paidRows[0] || null;
    let alreadyPaid = false;

    if (!persistedOrder) {
      const currentRows = await sql`
        SELECT id, status, email, customer_name, customer_first_name,
               shipping_name, shipping_street, shipping_street2, shipping_city,
               shipping_state, shipping_zip, shipping_country,
               paypal_order_id, paypal_capture_id, total_cents
          FROM orders
         WHERE id = ${internalOrderId}
         LIMIT 1
      `;
      const current = currentRows[0] || null;
      if (
        current?.status === 'paid'
        && current.paypal_order_id === orderID
        && current.paypal_capture_id === verifiedCapture.captureId
      ) {
        persistedOrder = current;
        alreadyPaid = true;
      } else {
        await markReconciliationRequired(sql, internalOrderId, 'ORDER_FINALIZATION_COMPARE_AND_SET_FAILED');
        return reply(202, verificationPayload(orderID, internalOrderId));
      }
    }

    return reply(200, successPayload({
      orderID,
      internalOrderId,
      validation: verifiedCapture,
      environment: paypalConfig.env,
      paypalData,
      shippingAddress,
      persistedOrder,
      alreadyPaid,
    }));
  } catch (error) {
    console.error('[paypal-capture] unexpected error', {
      internalOrderId,
      orderID,
      error: error?.message,
    });

    if (verifiedCapture?.ok) {
      try {
        const sql = neon(dbUrl);
        await markReconciliationRequired(sql, internalOrderId, error?.message || 'PAYPAL_CAPTURE_INTERNAL_ERROR');
      } catch { /* no-op */ }
      return reply(202, verificationPayload(orderID, internalOrderId));
    }

    return reply(500, {
      ok: false,
      error: 'PAYPAL_CAPTURE_INTERNAL_ERROR',
      message: 'Payment could not be completed. Please try again.',
    });
  }
};

exports._test = {
  normalizeEmail,
  extractCustomerEmail,
  extractShippingAddress,
  providerIssue,
  failedCaptureFromOrder,
  validateCompletedCapture,
  definitiveFailurePayload,
  verificationPayload,
};
