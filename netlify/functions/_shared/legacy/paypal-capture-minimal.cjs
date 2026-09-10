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

  // PayPal normally returns purchase_units[].shipping for shippable orders.
  // Hosted-card billing data is a last-resort fallback when PayPal omits a
  // separate shipping object after collecting the address.
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
  const country = firstNonEmpty(address.country_code, address.country);

  if (!(name || street || street2 || city || state || zip || country)) return null;

  return {
    name: name || null,
    street: street || null,
    street2: street2 || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    country: country || 'US',
  };
}

function customerFirstName(shippingAddress) {
  if (!shippingAddress?.name) return null;
  return String(shippingAddress.name).trim().split(/\s+/)[0] || null;
}

function getPayPalConfig() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
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
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error('[paypal-capture] PayPal authentication failed', response.status, details);
    throw new Error('PAYPAL_AUTH_FAILED');
  }
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
    return true;
  } catch (error) {
    // Ledger failures must be visible, but they must never allow a stale order
    // to proceed to capture or turn a completed payment into a retry prompt.
    console.error('[paypal-capture] payment attempt ledger write failed', {
      internalOrderId: attempt.internalOrderId,
      paypalOrderId: attempt.paypalOrderId,
      captureId: attempt.captureId,
      error: error?.message,
    });
    return false;
  }
}

async function alertReconciliation(order, details) {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  if (!siteUrl || !internalSecret) {
    console.error('[paypal-capture] reconciliation alert was not sent because URL/internal secret is missing', {
      internalOrderId: order?.id,
      ...details,
    });
    return false;
  }

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/payment-reconciliation-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Job-Secret': internalSecret,
      },
      body: JSON.stringify({
        priority: 'P0',
        internalOrderId: order.id,
        customer: order.email,
        amountCents: order.total_cents,
        ...details,
      }),
    });
    if (!response.ok) {
      console.error('[paypal-capture] reconciliation alert endpoint failed', {
        internalOrderId: order.id,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[paypal-capture] reconciliation alert failed', {
      internalOrderId: order?.id,
      error: error?.message,
    });
    return false;
  }
}

async function queueProductionPdfs(internalOrderId) {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  if (!siteUrl || !internalSecret) {
    console.warn('[paypal_capture] PDF generation was not queued because URL/internal secret is missing');
    return false;
  }

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/generate-paid-order-pdfs-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Job-Secret': internalSecret,
      },
      body: JSON.stringify({ orderId: internalOrderId }),
    });
    if (!response.ok) throw new Error(`Background PDF queue returned ${response.status}`);
    return true;
  } catch (error) {
    // Production rendering is downstream of payment. It must be retryable from
    // Admin and must never roll back or disguise a completed PayPal capture.
    console.error('[paypal_capture] production_pipeline_queue_failed', {
      internalOrderId,
      error: error?.message,
    });
    return false;
  }
}

function buildSuccessPayload({
  orderID,
  internalOrderId,
  validation,
  environment,
  paypalData,
  shippingAddress,
  persistedOrder,
  alreadyPaid = false,
}) {
  const persistedEmail = normalizeEmail(persistedOrder?.email);
  const persistedName = persistedOrder?.customer_name
    || persistedOrder?.shipping_name
    || shippingAddress?.name
    || null;

  return {
    success: true,
    alreadyPaid,
    paymentCaptured: true,
    reconciliationRequired: false,
    paypalOrderID: orderID,
    orderID,
    captureID: validation.captureId,
    status: validation.orderStatus || 'COMPLETED',
    captureStatus: validation.captureStatus || 'COMPLETED',
    capturedAmountCents: validation.amountCents,
    capturedCurrency: validation.currency || 'USD',
    environment,
    paypalData,
    shippingAddress,
    customerEmail: persistedEmail,
    customerName: persistedName,
    customerInfoPersisted: Boolean(
      persistedEmail
      && persistedName
      && persistedOrder?.shipping_street
      && persistedOrder?.shipping_city
      && persistedOrder?.shipping_state
      && persistedOrder?.shipping_zip
    ),
    internalOrderId,
  };
}

function buildReconciliationPayload({
  orderID,
  internalOrderId,
  validation,
  environment,
  paypalData,
  shippingAddress,
}) {
  return {
    ok: true,
    success: true,
    paymentCaptured: true,
    reconciliationRequired: true,
    paypalOrderID: orderID,
    orderID,
    captureID: validation.captureId,
    status: validation.orderStatus || 'COMPLETED',
    captureStatus: validation.captureStatus || 'COMPLETED',
    capturedAmountCents: validation.amountCents,
    capturedCurrency: validation.currency || 'USD',
    environment,
    paypalData,
    shippingAddress,
    internalOrderId,
    message: 'Your payment was received. Your order is being verified. Do not submit another payment.',
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
    return { ok: false, code: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH', orderStatus, captureStatus, captureId, currency, amountCents: capturedAmountCents, expectedCents: Number(expectedTotalCents) };
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  // This is deliberately before database credentials and every PayPal request.
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

  let order = null;
  let paypalConfig = null;
  let paypalData = null;
  let orderData = null;
  let shippingAddress = null;
  let validation = null;

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

    // A stale or conflicting PayPal ID is blocked before OAuth and, critically,
    // before POST /capture can ever be called.
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
        return reply(409, {
          ok: false,
          error: 'PAID_ORDER_REQUIRES_RECONCILIATION',
          reconciliationRequired: true,
          doNotRetry: true,
        });
      }

      const existingShippingAddress = extractShippingAddress({
        purchase_units: [{
          shipping: {
            name: { full_name: order.shipping_name },
            address: {
              address_line_1: order.shipping_street,
              address_line_2: order.shipping_street2,
              admin_area_2: order.shipping_city,
              admin_area_1: order.shipping_state,
              postal_code: order.shipping_zip,
              country_code: order.shipping_country,
            },
          },
        }],
      });
      return reply(200, buildSuccessPayload({
        orderID,
        internalOrderId,
        validation: {
          captureId: order.paypal_capture_id,
          orderStatus: 'COMPLETED',
          captureStatus: 'COMPLETED',
          amountCents: Number(order.total_cents),
          currency: 'USD',
        },
        environment: process.env.PAYPAL_ENV || 'sandbox',
        paypalData: null,
        shippingAddress: existingShippingAddress,
        persistedOrder: order,
        alreadyPaid: true,
      }));
    }

    paypalConfig = getPayPalConfig();
    const accessToken = await getPayPalAccessToken(paypalConfig);

    const orderResult = await retrievePayPalOrder(paypalConfig, accessToken, orderID);
    if (!orderResult.ok) {
      return reply(409, {
        ok: false,
        error: 'PAYPAL_ORDER_UNAVAILABLE',
        paypalStatus: orderResult.status,
      });
    }
    orderData = orderResult.data;
    const identity = orderIdentity(orderData);

    if (!matchesInternalOrder(orderData, order)) {
      await safeRecordAttempt(sql, {
        internalOrderId,
        checkoutKey: order.checkout_idempotency_key,
        paypalOrderId: orderID,
        source: 'capture',
        orderStatus: orderData?.status,
        amountCents: identity.amountCents,
        currency: identity.currency,
        invoiceId: identity.invoiceId,
        customId: identity.customId,
        processingStatus: 'rejected_before_capture',
        duplicateSuspected: true,
        errorCode: identity.currency !== 'USD' || identity.amountCents !== Number(order.total_cents)
          ? 'PAYPAL_AMOUNT_MISMATCH'
          : 'PAYPAL_ORDER_IDENTITY_MISMATCH',
        raw: orderData,
      });
      return reply(409, {
        ok: false,
        error: identity.currency !== 'USD' || identity.amountCents !== Number(order.total_cents)
          ? 'PAYPAL_AMOUNT_MISMATCH'
          : 'PAYPAL_ORDER_IDENTITY_MISMATCH',
      });
    }

    const alreadyCaptured = captureFromOrder(orderData);
    paypalData = orderData;

    if (!alreadyCaptured) {
      let captureResponse = null;
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
        paypalData = await captureResponse.json().catch(() => ({}));
      } catch (captureError) {
        console.error('[paypal-capture] capture request threw; checking PayPal before returning', {
          internalOrderId,
          orderID,
          error: captureError?.message,
        });
      }

      // A non-2xx response or lost response can still follow a completed capture.
      // Re-read PayPal and trust only a verified COMPLETED capture before deciding
      // whether the customer may safely try again.
      if (!captureResponse?.ok || !captureFromOrder(paypalData)) {
        const recovered = await retrievePayPalOrder(paypalConfig, accessToken, orderID);
        if (recovered.ok && captureFromOrder(recovered.data)) {
          paypalData = recovered.data;
        } else if (!captureResponse?.ok) {
          return reply(202, {
            ok: true,
            paymentCaptured: false,
            paymentStatusUnknown: true,
            reconciliationRequired: true,
            doNotRetry: true,
            paypalOrderID: orderID,
            orderID,
            internalOrderId,
            message: 'We are verifying your payment. Do not submit another payment.',
          });
        }
      }
    }

    validation = validateCompletedCapture(paypalData, order.total_cents);
    if (!validation.ok) {
      return reply(409, {
        ok: false,
        error: validation.code,
        paymentCaptured: Boolean(captureFromOrder(paypalData)),
        reconciliationRequired: Boolean(captureFromOrder(paypalData)),
        doNotRetry: Boolean(captureFromOrder(paypalData)),
        paypalOrderStatus: validation.orderStatus,
        paypalCaptureStatus: validation.captureStatus,
        capturedCurrency: validation.currency,
      });
    }

    shippingAddress = extractShippingAddress(paypalData) || extractShippingAddress(orderData);
    const payerEmail = extractCustomerEmail(paypalData) || extractCustomerEmail(orderData);
    const firstName = customerFirstName(shippingAddress);

    // Persist evidence before the order transition. Failure is loudly logged,
    // while the authoritative order row still records the completed capture.
    await safeRecordAttempt(sql, {
      internalOrderId,
      checkoutKey: order.checkout_idempotency_key,
      paypalOrderId: orderID,
      captureId: validation.captureId,
      requestId: `capture-${orderID}`,
      source: 'capture',
      orderStatus: validation.orderStatus,
      captureStatus: validation.captureStatus,
      amountCents: validation.amountCents,
      currency: validation.currency,
      payerEmail,
      payerId: paypalData?.payer?.payer_id || orderData?.payer?.payer_id,
      invoiceId: identity.invoiceId,
      customId: identity.customId,
      processingStatus: 'captured',
      raw: paypalData,
    });

    const paidRows = await sql`
      UPDATE orders SET
        status = 'paid',
        paypal_capture_id = ${validation.captureId},
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
        AND total_cents = ${validation.amountCents}
        AND paypal_capture_id IS NULL
      RETURNING id, status, email, customer_name, customer_first_name,
                shipping_name, shipping_street, shipping_street2, shipping_city,
                shipping_state, shipping_zip, shipping_country,
                paypal_order_id, paypal_capture_id
    `;

    let persistedOrder = paidRows[0] || null;
    let transitionedToPaid = Boolean(persistedOrder);

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

      // A simultaneous callback may have finalized this exact capture first.
      // Treat it as idempotent success rather than a false failure/retry signal.
      if (current?.status === 'paid'
        && current.paypal_order_id === orderID
        && current.paypal_capture_id === validation.captureId) {
        persistedOrder = current;
        transitionedToPaid = false;
      } else {
        try {
          await sql`
            UPDATE orders
               SET payment_reconciliation_status = 'required', updated_at = NOW()
             WHERE id = ${internalOrderId}
          `;
        } catch (markError) {
          console.error('[paypal-capture] could not mark reconciliation required', markError);
        }

        await alertReconciliation(order, {
          paypalOrderID: orderID,
          captureID: validation.captureId,
          error: 'ORDER_FINALIZATION_COMPARE_AND_SET_FAILED',
        });

        return reply(202, buildReconciliationPayload({
          orderID,
          internalOrderId,
          validation,
          environment: paypalConfig.env,
          paypalData,
          shippingAddress,
        }));
      }
    }

    // The order is durably paid before any production work starts. Only the
    // invocation that performed the pending -> paid transition queues work.
    if (transitionedToPaid) await queueProductionPdfs(internalOrderId);

    return reply(200, buildSuccessPayload({
      orderID,
      internalOrderId,
      validation,
      environment: paypalConfig.env,
      paypalData,
      shippingAddress,
      persistedOrder,
      alreadyPaid: !transitionedToPaid,
    }));
  } catch (error) {
    console.error('[paypal-capture] unexpected error', {
      internalOrderId,
      orderID,
      error: error?.message,
    });

    // Once PayPal has been verified as completed, never instruct the customer
    // to retry because of a downstream application failure.
    if (validation?.ok) {
      if (order) {
        await alertReconciliation(order, {
          paypalOrderID: orderID,
          captureID: validation.captureId,
          error: error?.message || 'PAYPAL_CAPTURE_INTERNAL_ERROR',
        });
      }
      return reply(202, buildReconciliationPayload({
        orderID,
        internalOrderId,
        validation,
        environment: paypalConfig?.env || process.env.PAYPAL_ENV || 'sandbox',
        paypalData,
        shippingAddress,
      }));
    }

    return reply(500, {
      ok: false,
      error: 'PAYPAL_CAPTURE_INTERNAL_ERROR',
    });
  }
};

exports._test = {
  normalizeEmail,
  extractCustomerEmail,
  extractShippingAddress,
  joinName,
  customerFirstName,
  queueProductionPdfs,
  buildSuccessPayload,
  buildReconciliationPayload,
  validateCompletedCapture,
};
