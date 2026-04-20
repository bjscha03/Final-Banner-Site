const { randomUUID } = require('crypto');

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
    const { orderID } = JSON.parse(event.body || '{}');
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
        'PayPal-Request-Id': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
    
    // Extract shipping address from capture response, then fallback to pre-capture order payload
    const shippingAddress = extractShippingAddress(captureData) || extractShippingAddress(orderData);
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderID: orderID,
        captureID: captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        status: captureData.status,
        environment: env,
        paypalData: captureData,
        shippingAddress: shippingAddress
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
