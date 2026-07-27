const { validatePayPalCapture } = require('./_shared/paypalConversionHelpers.cjs');
const { neon } = require('@neondatabase/serverless');

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function extractShippingAddress(paypalData) {
  if (!paypalData) return null;

  const shipping = paypalData.purchase_units?.[0]?.shipping || null;
  const payer = paypalData.payer || null;
  const address = shipping?.address || payer?.address || {};

  const name = firstNonEmpty(
    shipping?.name?.full_name,
    `${payer?.name?.given_name || ''} ${payer?.name?.surname || ''}`
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
    country: country || 'US'
  };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
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

    // Get environment and credentials
    const env = process.env.PAYPAL_ENV || 'sandbox';
    const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
    const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
    
    if (!clientId || !secret) {
      console.error(`PayPal credentials missing for environment: ${env}`);
      return { statusCode: 500, headers, body: JSON.stringify({ 
        error: 'PayPal credentials missing',
        environment: env
      }) };
    }

    const baseUrl = env === 'live' 
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    // Get PayPal access token
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('PayPal token error:', errorText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayPal authentication failed' }) };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Read order details before capture as fallback for shipping/name fields
    let orderData = null;
    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (orderResponse.ok) {
      orderData = await orderResponse.json();
    } else {
      console.warn(`Unable to fetch PayPal order ${orderID} before capture for shipping fallback`);
    }

    // Capture the payment
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'PayPal-Request-Id': `capture-${orderID}`
      }
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('PayPal capture error:', errorText);
      return { statusCode: 400, headers, body: JSON.stringify({ 
        error: 'Payment capture failed',
        details: errorText
      }) };
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
        })
      };
    }
    
    // Extract shipping address from capture response, then fallback to pre-capture order payload
    const shippingAddress = extractShippingAddress(captureData) || extractShippingAddress(orderData);
    const payerEmail = firstNonEmpty(captureData?.payer?.email_address, orderData?.payer?.email_address);
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl || !internalOrderId) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Captured payment requires internal order reconciliation', reconciliationRequired: true }) };
    }
    const sql = neon(dbUrl);
    const paidRows = await sql`
      UPDATE orders SET
        status = 'paid',
        paypal_order_id = ${orderID},
        paypal_capture_id = ${captureValidation.captureId},
        payment_method = 'paypal',
        payment_reconciliation_status = 'complete',
        email = CASE WHEN email LIKE 'guest-%@bannersonthefly.com' AND ${payerEmail || null} IS NOT NULL THEN ${payerEmail || null} ELSE email END,
        customer_name = COALESCE(customer_name, ${shippingAddress?.name || null}),
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
      RETURNING id, status
    `;
    if (!paidRows.length) {
      await sql`UPDATE orders SET payment_reconciliation_status = 'required', updated_at = NOW() WHERE id = ${internalOrderId}`;
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Payment captured but internal order update requires reconciliation', reconciliationRequired: true }) };
    }
    // Payment is durable before production work begins. Generate canonical PDFs
    // from each saved scene; failures are recorded for admin retry and never
    // roll back a completed PayPal capture.
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
      console.error('[paypal_capture] production_pipeline_queue_failed', { internalOrderId, error: productionError?.message });
    }
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderID: orderID,
        captureID: captureValidation.captureId,
        status: captureValidation.orderStatus,
        captureStatus: captureValidation.captureStatus,
        capturedAmountCents: captureValidation.amountCents,
        capturedCurrency: captureValidation.currency,
        environment: env,
        paypalData: captureData,
        shippingAddress: shippingAddress
        ,internalOrderId
      })
    };

  } catch (error) {
    console.error('PayPal capture function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
