/**
 * PayPal Create Credits Order
 * 
 * Creates a PayPal order for purchasing AI generation credits
 */

const { randomUUID } = require('crypto');

// PayPal API helpers
const getPayPalCredentials = () => {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

  console.log('PayPal credentials check:', {
    env,
    clientIdExists: !!clientId,
    secretExists: !!secret,
  });

  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured for environment: ${env}`);
  }
  
  return {
    clientId,
    secret,
    baseUrl: env === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com'
  };
};

const getPayPalAccessToken = async () => {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event, context) => {
  const cid = randomUUID();
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED', cid }),
    };
  }

  try {
    console.log('=== PayPal Create Credits Order ===', { cid });

    // Parse request body
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('Invalid JSON:', parseError, 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'INVALID_JSON', cid }),
      };
    }

    const { userId, email, credits, amountCents } = payload;

    // Validate required fields
    if (!userId || !credits || !amountCents) {
      console.error('Missing required fields:', { userId, credits, amountCents }, 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_REQUIRED_FIELDS', cid }),
      };
    }

    // Validate credit packages
    const validPackages = {
      10: 500,   // 10 credits = $5.00
      50: 2000,  // 50 credits = $20.00
      100: 3500, // 100 credits = $35.00
    };

    if (!validPackages[credits] || validPackages[credits] !== amountCents) {
      console.error('Invalid credit package:', { credits, amountCents }, 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'INVALID_PACKAGE', cid }),
      };
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();
    const { baseUrl } = getPayPalCredentials();

    // Create PayPal order
    const amountUSD = (amountCents / 100).toFixed(2);
    
    console.log('💰 Amount calculation:', { amountCents, amountUSD, credits, cid });
    
    // Simplified PayPal order payload - removed items/breakdown to avoid MALFORMED_REQUEST error
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: `${credits} AI Generation Credits`,
          amount: {
            currency_code: 'USD',
            value: amountUSD,
          },
        },
      ],
      application_context: {
        brand_name: 'Banners On The Fly',
        shipping_preference: 'NO_SHIPPING',
      },
    };
    
    console.log('📦 PayPal order payload:', JSON.stringify(orderPayload, null, 2));

    console.log('Creating PayPal order:', { credits, amountUSD, cid });

    const createResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.error('PayPal order creation failed:', errorData, 'cid:', cid);
      return {
        statusCode: createResponse.status,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'PAYPAL_ORDER_CREATION_FAILED',
          details: errorData,
          cid,
        }),
      };
    }

    const orderData = await createResponse.json();
    console.log('✅ PayPal order created successfully:', orderData.id, 'cid:', cid);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        orderID: orderData.id,
        cid,
      }),
    };
  } catch (error) {
    console.error('Error creating PayPal credits order:', error, 'cid:', cid);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
        cid,
      }),
    };
  }
};
