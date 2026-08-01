'use strict';

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
  'Cache-Control': 'no-store, max-age=0',
};

const DEFINITIVE_FAILURE_CODES = new Set([
  'INSTRUMENT_DECLINED',
  'CARD_DECLINED',
  'DECLINED',
  'PAYMENT_DENIED',
  'PAYER_CANNOT_PAY',
  'PAYER_ACTION_REQUIRED',
  'TRANSACTION_REFUSED',
  'CREDIT_CARD_REFUSED',
  'CREDIT_CARD_CVV_CHECK_FAILED',
  'INVALID_SECURITY_CODE',
  'INVALID_CVV',
  'INVALID_EXPIRY_DATE',
  'CARD_EXPIRED',
  'CARD_NOT_SUPPORTED',
  'CARD_TYPE_NOT_SUPPORTED',
  'PAYMENT_SOURCE_DECLINED_BY_PROCESSOR',
  'PAYMENT_SOURCE_INFO_CANNOT_BE_VERIFIED',
  'PAYMENT_SOURCE_CANNOT_BE_USED',
  'PAYPAL_PAYMENT_DECLINED',
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

function clean(value, max = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function normalizeEmail(value) {
  const email = clean(value, 320)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/^guest-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
  if (/^preview-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
  if (email === 'guest@example.com') return null;
  return email;
}

function normalizeCustomerInfo(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const fullName = clean(raw.fullName || raw.name, 200);
  return {
    fullName,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    email: normalizeEmail(raw.email),
    phone: clean(raw.phone, 40),
    address1: clean(raw.address1 || raw.street || raw.line1, 300),
    address2: clean(raw.address2 || raw.street2 || raw.line2, 300),
    city: clean(raw.city, 160),
    state: clean(raw.state, 80)?.toUpperCase() || null,
    postalCode: clean(raw.postalCode || raw.zip, 40),
    country: clean(raw.country, 8)?.toUpperCase() || 'US',
  };
}

function extractCustomerEmail(paypalData) {
  if (!paypalData || typeof paypalData !== 'object') return null;
  const source = paypalData.payment_source || {};
  const candidates = [
    paypalData.payer?.email_address,
    source.paypal?.email_address,
    source.card?.attributes?.customer?.email_address,
    source.card?.email_address,
    source.apple_pay?.email_address,
    source.google_pay?.email_address,
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
  const unit = Array.isArray(paypalData.purchase_units)
    ? paypalData.purchase_units.find((candidate) => candidate?.shipping) || paypalData.purchase_units[0]
    : null;
  const shipping = unit?.shipping || null;
  const payer = paypalData.payer || null;
  const source = paypalData.payment_source || {};
  const card = source.card || null;
  const paypal = source.paypal || null;
  const address = shipping?.address || payer?.address || card?.billing_address || {};
  const name = firstNonEmpty(
    joinName(shipping?.name),
    joinName(paypal?.name),
    card?.name,
    joinName(card?.attributes?.customer?.name),
    joinName(payer?.name),
  );
  const result = {
    name,
    street: firstNonEmpty(address.address_line_1, address.line1, address.street),
    street2: firstNonEmpty(address.address_line_2, address.line2, address.street2),
    city: firstNonEmpty(address.admin_area_2, address.city),
    state: firstNonEmpty(address.admin_area_1, address.state, address.region),
    zip: firstNonEmpty(address.postal_code, address.zip),
    country: firstNonEmpty(address.country_code, address.country) || 'US',
  };
  if (!(result.name || result.street || result.city || result.state || result.zip)) return null;
  return result;
}

function allCaptures(order) {
  return Array.isArray(order?.purchase_units)
    ? order.purchase_units.flatMap((unit) => unit?.payments?.captures || [])
    : [];
}

function failedCaptureFromOrder(order) {
  return allCaptures(order).find((capture) => ['DECLINED', 'FAILED'].includes(String(capture?.status || '').toUpperCase())) || null;
}

function providerCode(payload) {
  const details = Array.isArray(payload?.details) ? payload.details : [];
  const issue = details.find((detail) => detail?.issue)?.issue;
  const reason = details.find((detail) => detail?.reason)?.reason;
  return String(firstNonEmpty(issue, reason, payload?.status_details?.reason, payload?.name) || '').toUpperCase() || null;
}

function providerText(payload) {
  const details = Array.isArray(payload?.details) ? payload.details : [];
  return [
    payload?.name,
    payload?.message,
    ...details.flatMap((detail) => [detail?.issue, detail?.description, detail?.reason]),
  ].filter(Boolean).join(' ');
}

function isDefinitiveFailure(payload, httpStatus) {
  const code = providerCode(payload);
  if (code && DEFINITIVE_FAILURE_CODES.has(code)) return true;
  const text = providerText(payload);
  if (/declin|refus|expired|invalid\s+(cvv|security|expir)|cannot\s+pay|payment\s+denied/i.test(text)) return true;
  return [400, 402, 422].includes(Number(httpStatus)) && Boolean(code) && !/INTERNAL|TIMEOUT|UNAVAILABLE/i.test(code);
}

function getConfig() {
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

async function getAccessToken(config) {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PAYPAL_AUTH_FAILED_${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error('PAYPAL_AUTH_TOKEN_MISSING');
  return payload.access_token;
}

async function retrieveOrder(config, accessToken, orderID) {
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
    console.error('[paypal-capture] ledger write failed', {
      internalOrderId: attempt.internalOrderId,
      paypalOrderId: attempt.paypalOrderId,
      captureId: attempt.captureId,
      error: error?.message,
    });
  }
}

async function markReconciliation(sql, internalOrderId, reason) {
  try {
    await sql`
      UPDATE orders
         SET payment_reconciliation_status = 'required', updated_at = NOW()
       WHERE id = ${internalOrderId}
         AND status = 'pending'
    `;
  } catch (error) {
    console.error('[paypal-capture] could not mark reconciliation', {
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
    orderID,
    paypalOrderID: orderID,
    internalOrderId,
    message: message || 'We are confirming your payment. Do not submit another payment.',
  };
}

function failurePayload(orderID, internalOrderId, code, message) {
  return {
    ok: false,
    success: false,
    paymentCaptured: false,
    paymentStatusUnknown: false,
    reconciliationRequired: false,
    doNotRetry: false,
    restartPayment: true,
    providerCode: code || 'PAYPAL_PAYMENT_DECLINED',
    error: code || 'PAYPAL_PAYMENT_DECLINED',
    orderID,
    paypalOrderID: orderID,
    internalOrderId,
    message: message || 'Your card was declined. Use a different card or payment method and try again.',
  };
}

function validateCompletedCapture(paypalData, expectedTotalCents) {
  const capture = captureFromOrder(paypalData);
  const captureStatus = String(capture?.status || '').toUpperCase();
  const captureId = clean(capture?.id, 200);
  const currency = String(capture?.amount?.currency_code || '').toUpperCase();
  const amountCents = amountToCents(capture?.amount?.value);
  if (!captureId || captureStatus !== 'COMPLETED') return { ok: false, code: 'PAYPAL_CAPTURE_NOT_COMPLETED' };
  if (currency !== 'USD') return { ok: false, code: 'PAYPAL_CAPTURE_CURRENCY_MISMATCH' };
  if (amountCents !== Number(expectedTotalCents)) return { ok: false, code: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH' };
  return { ok: true, captureId, captureStatus, currency, amountCents, capture };
}

async function persistCustomerInfo(sql, order, submitted, paypalData) {
  const customer = normalizeCustomerInfo(submitted);
  const paypalAddress = extractShippingAddress(paypalData);
  const email = customer.email || extractCustomerEmail(paypalData);
  const fullName = customer.fullName || paypalAddress?.name || null;
  const firstName = customer.firstName || (fullName ? String(fullName).split(/\s+/)[0] : null);
  const street = customer.address1 || paypalAddress?.street || null;
  const street2 = customer.address2 || paypalAddress?.street2 || null;
  const city = customer.city || paypalAddress?.city || null;
  const state = customer.state || paypalAddress?.state || null;
  const zip = customer.postalCode || paypalAddress?.zip || null;
  const country = customer.country || paypalAddress?.country || 'US';

  const rows = await sql`
    UPDATE orders
       SET email = CASE
             WHEN ${email || null} IS NOT NULL THEN ${email || null}
             ELSE email
           END,
           customer_name = COALESCE(${fullName}, customer_name, shipping_name),
           customer_first_name = COALESCE(${firstName}, customer_first_name),
           customer_phone = COALESCE(${customer.phone}, customer_phone),
           shipping_name = COALESCE(${fullName}, shipping_name),
           shipping_street = COALESCE(${street}, shipping_street),
           shipping_street2 = COALESCE(${street2}, shipping_street2),
           shipping_city = COALESCE(${city}, shipping_city),
           shipping_state = COALESCE(${state}, shipping_state),
           shipping_zip = COALESCE(${zip}, shipping_zip),
           shipping_country = COALESCE(${country}, shipping_country, 'US'),
           updated_at = NOW()
     WHERE id = ${order.id}
    RETURNING id, status, subtotal_cents, tax_cents, total_cents, email,
              customer_name, customer_first_name, customer_phone,
              shipping_name, shipping_street, shipping_street2, shipping_city,
              shipping_state, shipping_zip, shipping_country,
              paypal_order_id, paypal_capture_id
  `;
  return rows[0] || order;
}

function successPayload(order, paypalData, validation, environment, alreadyPaid) {
  return {
    ok: true,
    success: true,
    alreadyPaid: Boolean(alreadyPaid),
    paymentCaptured: true,
    paymentStatusUnknown: false,
    reconciliationRequired: false,
    doNotRetry: false,
    internalOrderId: order.id,
    orderID: order.paypal_order_id,
    paypalOrderID: order.paypal_order_id,
    captureID: order.paypal_capture_id || validation.captureId,
    status: 'COMPLETED',
    captureStatus: 'COMPLETED',
    capturedAmountCents: validation.amountCents,
    capturedCurrency: validation.currency,
    environment,
    customerEmail: normalizeEmail(order.email),
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
    total_cents: Number(order.total_cents || validation.amountCents || 0),
    paypalData,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (process.env.FEATURE_PAYPAL !== '1') return reply(503, { ok: false, error: 'PAYPAL_DISABLED' });

  let input = {};
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'INVALID_JSON' }); }
  const orderID = clean(input.orderID, 200);
  const internalOrderId = clean(input.internalOrderId, 100);
  const reconcileOnly = input.reconcileOnly === true;
  if (!orderID || !internalOrderId) return reply(400, { ok: false, error: 'ORDER_IDENTIFIERS_REQUIRED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return reply(500, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const sql = neon(dbUrl);
  let verifiedCapture = null;

  try {
    const rows = await sql`
      SELECT id, status, subtotal_cents, tax_cents, total_cents, currency, email,
             customer_name, customer_first_name, customer_phone,
             shipping_name, shipping_street, shipping_street2, shipping_city,
             shipping_state, shipping_zip, shipping_country,
             paypal_order_id, paypal_capture_id, checkout_idempotency_key
        FROM orders
       WHERE id = ${internalOrderId}
       LIMIT 1
    `;
    if (!rows.length) return reply(404, { ok: false, error: 'INTERNAL_ORDER_NOT_FOUND' });
    let order = rows[0];

    if (order.paypal_order_id !== orderID) return reply(409, { ok: false, error: 'PAYPAL_ORDER_LINK_MISMATCH' });
    if (!['pending', 'paid'].includes(order.status)) return reply(409, { ok: false, error: 'INTERNAL_ORDER_NOT_PAYABLE' });

    if (order.status === 'paid' && order.paypal_capture_id) {
      order = await persistCustomerInfo(sql, order, input.customerInfo, null);
      return reply(200, successPayload(order, null, {
        captureId: order.paypal_capture_id,
        amountCents: Number(order.total_cents),
        currency: 'USD',
      }, process.env.PAYPAL_ENV || 'sandbox', true));
    }

    const config = getConfig();
    const accessToken = await getAccessToken(config);
    const originalResult = await retrieveOrder(config, accessToken, orderID);
    if (!originalResult.ok) {
      await markReconciliation(sql, internalOrderId, `retrieve_${originalResult.status}`);
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
        processingStatus: 'rejected_before_capture',
        duplicateSuspected: true,
        errorCode: identity.amountCents !== Number(order.total_cents)
          ? 'PAYPAL_AMOUNT_MISMATCH'
          : 'PAYPAL_ORDER_IDENTITY_MISMATCH',
        raw: originalOrder,
      });
      return reply(409, { ok: false, error: 'PAYPAL_ORDER_IDENTITY_MISMATCH' });
    }

    let paypalData = originalOrder;
    let completed = captureFromOrder(paypalData);
    const preexistingFailure = failedCaptureFromOrder(paypalData);
    if (!completed && preexistingFailure) {
      const code = firstNonEmpty(preexistingFailure.status_details?.reason, preexistingFailure.status, 'PAYPAL_PAYMENT_DECLINED');
      return reply(422, failurePayload(orderID, internalOrderId, String(code).toUpperCase()));
    }

    if (!completed && reconcileOnly) {
      if (['VOIDED', 'EXPIRED'].includes(String(originalOrder?.status || '').toUpperCase())) {
        return reply(422, failurePayload(orderID, internalOrderId, 'PAYPAL_ORDER_EXPIRED', 'This payment attempt expired. Please try again.'));
      }
      return reply(202, verificationPayload(orderID, internalOrderId));
    }

    if (!completed) {
      let captureResponse = null;
      let captureBody = {};
      let captureThrown = null;
      try {
        captureResponse = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
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
        captureThrown = error;
      }

      if (captureResponse?.ok && captureFromOrder(captureBody)) {
        paypalData = captureBody;
        completed = captureFromOrder(paypalData);
      } else {
        const recovered = await retrieveOrder(config, accessToken, orderID);
        if (recovered.ok && captureFromOrder(recovered.data)) {
          paypalData = recovered.data;
          completed = captureFromOrder(paypalData);
        } else {
          const failed = recovered.ok ? failedCaptureFromOrder(recovered.data) : null;
          const failureEvidence = failed || captureBody;
          if (failed || isDefinitiveFailure(captureBody, captureResponse?.status)) {
            const code = firstNonEmpty(
              failed?.status_details?.reason,
              providerCode(captureBody),
              failed?.status,
              'PAYPAL_PAYMENT_DECLINED',
            );
            await safeRecordAttempt(sql, {
              internalOrderId,
              checkoutKey: order.checkout_idempotency_key,
              paypalOrderId: orderID,
              captureId: failed?.id,
              requestId: `capture-${orderID}`,
              source: 'capture',
              captureStatus: failed?.status,
              processingStatus: 'declined',
              errorCode: code,
              raw: failureEvidence,
            });
            return reply(422, failurePayload(orderID, internalOrderId, String(code).toUpperCase()));
          }

          await markReconciliation(sql, internalOrderId, providerCode(captureBody) || captureThrown?.message || 'PAYPAL_CAPTURE_UNKNOWN');
          return reply(202, verificationPayload(orderID, internalOrderId));
        }
      }
    }

    verifiedCapture = validateCompletedCapture(paypalData, order.total_cents);
    if (!verifiedCapture.ok) {
      await markReconciliation(sql, internalOrderId, verifiedCapture.code);
      return reply(202, verificationPayload(orderID, internalOrderId));
    }

    const submitted = normalizeCustomerInfo(input.customerInfo);
    const paypalAddress = extractShippingAddress(paypalData) || extractShippingAddress(originalOrder);
    const payerEmail = submitted.email || extractCustomerEmail(paypalData) || extractCustomerEmail(originalOrder);
    const fullName = submitted.fullName || paypalAddress?.name || null;
    const firstName = submitted.firstName || (fullName ? String(fullName).split(/\s+/)[0] : null);

    await safeRecordAttempt(sql, {
      internalOrderId,
      checkoutKey: order.checkout_idempotency_key,
      paypalOrderId: orderID,
      captureId: verifiedCapture.captureId,
      requestId: `capture-${orderID}`,
      source: 'capture',
      orderStatus: String(paypalData?.status || 'COMPLETED'),
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
        email = COALESCE(${payerEmail}, email),
        customer_name = COALESCE(${fullName}, customer_name, shipping_name),
        customer_first_name = COALESCE(${firstName}, customer_first_name),
        customer_phone = COALESCE(${submitted.phone}, customer_phone),
        shipping_name = COALESCE(${fullName}, shipping_name),
        shipping_street = COALESCE(${submitted.address1 || paypalAddress?.street || null}, shipping_street),
        shipping_street2 = COALESCE(${submitted.address2 || paypalAddress?.street2 || null}, shipping_street2),
        shipping_city = COALESCE(${submitted.city || paypalAddress?.city || null}, shipping_city),
        shipping_state = COALESCE(${submitted.state || paypalAddress?.state || null}, shipping_state),
        shipping_zip = COALESCE(${submitted.postalCode || paypalAddress?.zip || null}, shipping_zip),
        shipping_country = COALESCE(${submitted.country || paypalAddress?.country || 'US'}, shipping_country, 'US'),
        updated_at = NOW()
      WHERE id = ${internalOrderId}
        AND status = 'pending'
        AND paypal_order_id = ${orderID}
        AND total_cents = ${verifiedCapture.amountCents}
        AND paypal_capture_id IS NULL
      RETURNING id, status, subtotal_cents, tax_cents, total_cents, email,
                customer_name, customer_first_name, customer_phone,
                shipping_name, shipping_street, shipping_street2, shipping_city,
                shipping_state, shipping_zip, shipping_country,
                paypal_order_id, paypal_capture_id
    `;

    let persisted = paidRows[0] || null;
    let alreadyPaid = false;
    if (!persisted) {
      const currentRows = await sql`
        SELECT id, status, subtotal_cents, tax_cents, total_cents, email,
               customer_name, customer_first_name, customer_phone,
               shipping_name, shipping_street, shipping_street2, shipping_city,
               shipping_state, shipping_zip, shipping_country,
               paypal_order_id, paypal_capture_id
          FROM orders
         WHERE id = ${internalOrderId}
         LIMIT 1
      `;
      const current = currentRows[0] || null;
      if (current?.status === 'paid'
        && current.paypal_order_id === orderID
        && current.paypal_capture_id === verifiedCapture.captureId) {
        persisted = await persistCustomerInfo(sql, current, input.customerInfo, paypalData);
        alreadyPaid = true;
      } else {
        await markReconciliation(sql, internalOrderId, 'ORDER_FINALIZATION_CONFLICT');
        return reply(202, verificationPayload(orderID, internalOrderId));
      }
    }

    return reply(200, successPayload(persisted, paypalData, verifiedCapture, config.env, alreadyPaid));
  } catch (error) {
    console.error('[paypal-capture] unexpected error', {
      internalOrderId,
      orderID,
      error: error?.message,
    });
    if (verifiedCapture?.ok) {
      await markReconciliation(sql, internalOrderId, error?.message || 'FINALIZATION_FAILED');
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
  normalizeCustomerInfo,
  extractCustomerEmail,
  extractShippingAddress,
  failedCaptureFromOrder,
  providerCode,
  isDefinitiveFailure,
  validateCompletedCapture,
  failurePayload,
  verificationPayload,
};
