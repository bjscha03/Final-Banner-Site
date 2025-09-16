const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');

// PayPal API helpers
const getPayPalCredentials = () => {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

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
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en_US',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`PayPal auth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
};

const capturePayPalOrder = async (orderId, accessToken) => {
  const { baseUrl } = getPayPalCredentials();
  
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal capture failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event, context) => {
  const cid = randomUUID().substring(0, 8);
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED', cid }),
    };
  }

  try {
    console.log('=== Simple PayPal Capture ===', { cid });
    
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

    const { paypalOrderId, cartItems, userEmail } = payload;

    if (!paypalOrderId) {
      console.error('Missing paypalOrderId:', 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_PAYPAL_ORDER_ID', cid }),
      };
    }

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      console.error('Missing cart items:', 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_CART_ITEMS', cid }),
      };
    }

    console.log('Capturing PayPal order:', { paypalOrderId, cid });

    let accessToken, captureDetails;

    try {
      // Get PayPal access token
      accessToken = await getPayPalAccessToken();
      console.log('Got PayPal access token:', { cid });
    } catch (authError) {
      console.error('PayPal auth error:', authError, 'cid:', cid);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'PAYPAL_AUTH_ERROR',
          message: authError.message,
          cid
        }),
      };
    }

    try {
      // Capture the PayPal order
      captureDetails = await capturePayPalOrder(paypalOrderId, accessToken);
    } catch (captureError) {
      console.error('PayPal capture error:', captureError, 'cid:', cid);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'PAYPAL_CAPTURE_ERROR',
          message: captureError.message,
          cid
        }),
      };
    }
    console.log('PayPal capture response:', {
      status: captureDetails.status,
      hasUnits: !!captureDetails.purchase_units,
      unitsLength: captureDetails.purchase_units?.length,
      cid
    });

    // Safely extract capture ID
    const purchaseUnit = captureDetails.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureId = capture?.id;

    if (!captureId) {
      console.error('No capture ID found in PayPal response:', { captureDetails, cid });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'PAYPAL_CAPTURE_INCOMPLETE', cid }),
      };
    }

    console.log('PayPal capture successful:', { captureId, cid });

    // Calculate totals
    const subtotalCents = cartItems.reduce((sum, item) => sum + (item.line_total_cents || 0), 0);
    const taxCents = Math.round(subtotalCents * 0.06); // 6% tax
    const totalCents = subtotalCents + taxCents;

    // Create order in database
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    const orderId = randomUUID();
    const payerEmail = captureDetails.payer?.email_address || userEmail || 'unknown@example.com';
    const payerName = captureDetails.payer?.name ?
      `${captureDetails.payer.name.given_name || ''} ${captureDetails.payer.name.surname || ''}`.trim() :
      'Unknown Customer';

    console.log('Creating order in database:', { orderId, payerEmail, totalCents, cid });

    try {
      const orderResult = await sql`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents,
          status, paypal_order_id, paypal_capture_id, customer_name
        )
        VALUES (
          ${orderId}, null, ${payerEmail}, ${subtotalCents}, ${taxCents}, ${totalCents},
          'paid', ${paypalOrderId}, ${captureId}, ${payerName}
        )
        RETURNING *
      `;

      console.log('Order created successfully:', { orderId, cid });

      // Create order items
      for (const item of cartItems) {
        await sql`
          INSERT INTO order_items (
            id, order_id, width_in, height_in, quantity, material,
            grommets, rope_feet, pole_pockets, line_total_cents
          )
          VALUES (
            ${randomUUID()}, ${orderId},
            ${item.width_in || 0}, ${item.height_in || 0}, ${item.quantity || 1},
            ${item.material || '13oz'}, ${item.grommets || 'none'},
            ${item.rope_feet || 0}, ${item.pole_pockets || 'none'},
            ${item.line_total_cents || 0}
          )
        `;
      }

      console.log('Order items created successfully:', { orderId, itemCount: cartItems.length, cid });
    } catch (dbError) {
      console.error('Database error:', dbError, 'cid:', cid);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'DATABASE_ERROR',
          message: dbError.message,
          cid
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        orderId,
        captureId,
        totalCents,
        cid
      }),
    };

  } catch (error) {
    console.error('PayPal capture error:', error, 'cid:', cid);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
        cid
      }),
    };
  }
};
