const { validatePayPalCapture } = require('../paypalConversionHelpers.cjs');
const { neon } = require('@neondatabase/serverless');

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeEmail(value) {
  const email = firstNonEmpty(value)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/^guest-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
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
  // Card billing data is a fallback for guest-card responses that omit a
  // separate shipping object even though the hosted form collected address data.
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

  const hasAnyAddressData = Boolean(name || street || street2 || city || state || zip || country);
  if (!hasAnyAddressData) return null;

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

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { orderID, internalOrderId } = JSON.parse(event.body || '{}');
    if (!orderID) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing orderID' }) };
    }

    const env = process.env.PAYPAL_ENV || 'sandbox';
    const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
    const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

    if (!clientId || !secret) {
      console.error(`PayPal credentials missing for environment: ${env}`);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'PayPal credentials missing', environment: env }),
      };
    }

    const baseUrl = env === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en_US',
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('PayPal token error:', errorText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayPal authentication failed' }) };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Request a complete pre-capture representation. Some guest-card fields are
    // present on the approved order even when the capture response is minimal.
    let orderData = null;
    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=representation',
      },
    });
    if (orderResponse.ok) {
      orderData = await orderResponse.json();
    } else {
      console.warn(`Unable to fetch PayPal order ${orderID} before capture for customer-info fallback`);
    }

    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': `capture-${orderID}`,
        Prefer: 'return=representation',
      },
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('PayPal capture error:', errorText);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Payment capture failed', details: errorText }),
      };
    }

    const captureData = await captureResponse.json();
    const captureValidation = validatePayPalCapture(captureData);
    if (!captureValidation.ok) {
      console.error('PayPal capture validation failed:', captureValidation);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Payment capture was not completed',
          code: captureValidation.code,
          paypalOrderStatus: captureValidation.orderStatus,
          paypalCaptureStatus: captureValidation.captureStatus,
          capturedCurrency: captureValidation.currency,
        }),
      };
    }

    // The hosted Debit or Credit Card / PayPal approval is the single source of
    // customer contact data. Capture response wins; approved-order data is the
    // fallback because PayPal can return different detail levels by funding type.
    const shippingAddress = extractShippingAddress(captureData) || extractShippingAddress(orderData);
    const payerEmail = extractCustomerEmail(captureData) || extractCustomerEmail(orderData);
    const customerFirstName = shippingAddress?.name
      ? String(shippingAddress.name).trim().split(/\s+/)[0] || null
      : null;

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl || !internalOrderId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Captured payment requires internal order reconciliation',
          reconciliationRequired: true,
        }),
      };
    }

    const sql = neon(dbUrl);
    const paidRows = await sql`
      UPDATE orders SET
        status = 'paid',
        paypal_order_id = ${orderID},
        paypal_capture_id = ${captureValidation.captureId},
        payment_method = 'paypal',
        payment_reconciliation_status = 'complete',
        email = CASE WHEN ${payerEmail || null} IS NOT NULL THEN ${payerEmail || null} ELSE email END,
        customer_name = COALESCE(${shippingAddress?.name || null}, customer_name),
        customer_first_name = COALESCE(${customerFirstName}, customer_first_name),
        shipping_name = COALESCE(${shippingAddress?.name || null}, shipping_name),
        shipping_street = COALESCE(${shippingAddress?.street || null}, shipping_street),
        shipping_street2 = COALESCE(${shippingAddress?.street2 || null}, shipping_street2),
        shipping_city = COALESCE(${shippingAddress?.city || null}, shipping_city),
        shipping_state = COALESCE(${shippingAddress?.state || null}, shipping_state),
        shipping_zip = COALESCE(${shippingAddress?.zip || null}, shipping_zip),
        shipping_country = COALESCE(${shippingAddress?.country || null}, shipping_country),
        updated_at = NOW()
      WHERE id = ${internalOrderId}
        AND paypal_order_id = ${orderID}
        AND total_cents = ${captureValidation.amountCents}
        AND status IN ('pending', 'paid')
      RETURNING id, status, email, customer_name,
                shipping_name, shipping_street, shipping_city,
                shipping_state, shipping_zip, shipping_country
    `;

    if (!paidRows.length) {
      await sql`
        UPDATE orders
           SET payment_reconciliation_status = 'required', updated_at = NOW()
         WHERE id = ${internalOrderId}
      `;
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: 'Payment captured but internal order update requires reconciliation',
          reconciliationRequired: true,
        }),
      };
    }

    const persistedOrder = paidRows[0];
    if (!normalizeEmail(persistedOrder.email)) {
      console.error('[paypal-capture-minimal] completed payment has no usable customer email', {
        internalOrderId,
        orderID,
        fundingSourceKeys: Object.keys(captureData.payment_source || orderData?.payment_source || {}),
      });
    }

    try {
      const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
      const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
      if (siteUrl && internalSecret) {
        const queued = await fetch(`${siteUrl}/.netlify/functions/generate-paid-order-pdfs-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Job-Secret': internalSecret },
          body: JSON.stringify({ orderId: internalOrderId }),
        });
        if (!queued.ok) throw new Error(`Background PDF queue returned ${queued.status}`);
      } else {
        console.warn('[paypal_capture] PDF generation was not queued because URL/internal secret is missing');
      }
    } catch (productionError) {
      console.error('[paypal_capture] production_pipeline_queue_failed', {
        internalOrderId,
        error: productionError?.message,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderID,
        captureID: captureValidation.captureId,
        status: captureValidation.orderStatus,
        captureStatus: captureValidation.captureStatus,
        capturedAmountCents: captureValidation.amountCents,
        capturedCurrency: captureValidation.currency,
        environment: env,
        paypalData: captureData,
        shippingAddress,
        customerEmail: normalizeEmail(persistedOrder.email),
        customerName: persistedOrder.customer_name || persistedOrder.shipping_name || shippingAddress?.name || null,
        customerInfoPersisted: Boolean(
          normalizeEmail(persistedOrder.email)
          && (persistedOrder.customer_name || persistedOrder.shipping_name)
          && persistedOrder.shipping_street
          && persistedOrder.shipping_city
          && persistedOrder.shipping_state
          && persistedOrder.shipping_zip
        ),
        internalOrderId,
      }),
    };
  } catch (error) {
    console.error('PayPal capture function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};

exports._test = {
  normalizeEmail,
  extractCustomerEmail,
  extractShippingAddress,
  joinName,
};
