const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');

// PayPal API helpers (duplicated from create-order for now)
const getPayPalCredentials = () => {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

  console.log('PayPal credentials check:', {
    env,
    clientIdExists: !!clientId,
    secretExists: !!secret,
    clientIdLength: clientId?.length,
    secretLength: secret?.length
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

// Pricing calculation helpers (copied from create-order.js)
const getFeatureFlags = () => {
  return {
    freeShipping: process.env.FEATURE_FREE_SHIPPING === '1',
    minOrderFloor: process.env.FEATURE_MIN_ORDER_FLOOR === '1',
    minOrderCents: parseInt(process.env.MIN_ORDER_CENTS || '2000', 10),
    shippingMethodLabel: process.env.SHIPPING_METHOD_LABEL || 'Free Next-Day Air'
  };
};

const computeTotals = (items, taxRate, opts) => {
  const raw = items.reduce((sum, i) => sum + i.line_total_cents, 0);
  const adjusted = Math.max(raw, opts.minFloorCents || 0);
  const minAdj = Math.max(0, adjusted - raw);

  const shipping_cents = opts.freeShipping ? 0 : 0;
  const tax_cents = Math.round(adjusted * taxRate);
  const total_cents = adjusted + tax_cents + shipping_cents;

  return {
    raw_subtotal_cents: raw,
    adjusted_subtotal_cents: adjusted,
    min_order_adjustment_cents: minAdj,
    shipping_cents,
    tax_cents,
    total_cents,
  };
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
    // Comprehensive environment check
    console.log('=== PayPal Capture Order Debug Info ===', { cid });
    console.log('Environment variables check:', {
      FEATURE_PAYPAL: process.env.FEATURE_PAYPAL,
      PAYPAL_ENV: process.env.PAYPAL_ENV,
      hasClientId: !!process.env.PAYPAL_CLIENT_ID_SANDBOX,
      hasSecret: !!process.env.PAYPAL_SECRET_SANDBOX,
      hasDatabase: !!process.env.NETLIFY_DATABASE_URL,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    });

    // Check if PayPal is enabled (temporarily disabled for debugging)
    // if (process.env.FEATURE_PAYPAL !== '1') {
    //   console.error('PayPal is disabled:', { FEATURE_PAYPAL: process.env.FEATURE_PAYPAL, cid });
    //   return {
    //     statusCode: 400,
    //     headers,
    //     body: JSON.stringify({ ok: false, error: 'PAYPAL_DISABLED', cid }),
    //   };
    // }
    console.log('PayPal feature flag check bypassed for debugging');

    // Parse request body
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('PayPal capture order - Invalid JSON:', parseError, 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'INVALID_JSON', cid }),
      };
    }

    const { paypalOrderId, cartItems, userEmail, userId } = payload;

    if (!paypalOrderId) {
      console.error('PayPal capture order - Missing paypalOrderId:', 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_PAYPAL_ORDER_ID', cid }),
      };
    }

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      console.error('PayPal capture order - Missing cart items:', 'cid:', cid);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_CART_ITEMS', cid }),
      };
    }

    // Initialize database connection
    if (!process.env.NETLIFY_DATABASE_URL) {
      console.error('PayPal capture order - Database URL not configured:', 'cid:', cid);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'DATABASE_NOT_CONFIGURED', cid }),
      };
    }

    const sql = neon(process.env.NETLIFY_DATABASE_URL);

    // Check for existing order with this PayPal order ID (idempotency)
    // Note: Since metadata column doesn't exist, we'll skip this check for now
    // TODO: Add metadata column or use a different approach for idempotency
    const existingOrder = [];

    if (existingOrder.length > 0) {
      console.log('PayPal capture order - Order already exists:', {
        cid,
        paypalOrderId,
        existingOrderId: existingOrder[0].id
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          orderId: existingOrder[0].id,
          cid
        }),
      };
    }

    // Get PayPal order details to verify status
    console.log('PayPal capture - Getting access token...', { cid, paypalOrderId });
    const accessToken = await getPayPalAccessToken();
    console.log('PayPal capture - Access token obtained', { cid, tokenLength: accessToken?.length });
    const { baseUrl } = getPayPalCredentials();
    console.log('PayPal capture - Using base URL:', { cid, baseUrl });

    const orderDetailsResponse = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!orderDetailsResponse.ok) {
      const errorText = await orderDetailsResponse.text();
      console.error('PayPal get order details failed:', {
        cid,
        paypalOrderId,
        status: orderDetailsResponse.status,
        error: errorText
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'PAYPAL_ORDER_DETAILS_FAILED', cid }),
      };
    }

    const orderDetails = await orderDetailsResponse.json();

    if (orderDetails.status !== 'APPROVED') {
      console.error('PayPal order not approved:', {
        cid,
        paypalOrderId,
        status: orderDetails.status
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'ORDER_NOT_APPROVED', cid }),
      };
    }

    // Capture the payment
    console.log('PayPal capture - Attempting capture...', { cid, paypalOrderId, baseUrl });
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('PayPal capture - Capture response status:', { cid, status: captureResponse.status });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('PayPal capture failed:', {
        cid,
        paypalOrderId,
        status: captureResponse.status,
        error: errorText
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'PAYPAL_CAPTURE_FAILED', cid }),
      };
    }

    const captureDetails = await captureResponse.json();

    // Verify captured amount matches server-calculated total
    const flags = getFeatureFlags();
    const taxRate = 0.06;
    const pricingOptions = {
      freeShipping: flags.freeShipping,
      minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
    };

    const serverTotals = computeTotals(cartItems, taxRate, pricingOptions);
    const expectedAmount = (serverTotals.total_cents / 100).toFixed(2);
    const capturedAmount = captureDetails.purchase_units[0].payments.captures[0].amount.value;

    if (expectedAmount !== capturedAmount) {
      console.error('PayPal amount mismatch:', {
        cid,
        paypalOrderId,
        expectedAmount,
        capturedAmount
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'AMOUNT_MISMATCH', cid }),
      };
    }

    // Create order in database using existing logic
    const orderId = randomUUID();
    const payerEmail = captureDetails.payer.email_address;
    const payerName = `${captureDetails.payer.name.given_name} ${captureDetails.payer.name.surname}`;
    const captureId = captureDetails.purchase_units[0].payments.captures[0].id;

    // Use provided email or fallback to payer email
    const finalEmail = userEmail || payerEmail;

    const orderResult = await sql`
      INSERT INTO orders (
        id, user_id, email, subtotal_cents, tax_cents, total_cents, status
      )
      VALUES (
        ${orderId}, ${userId || null}, ${finalEmail},
        ${serverTotals.adjusted_subtotal_cents}, ${serverTotals.tax_cents}, ${serverTotals.total_cents},
        'paid'
      )
      RETURNING *
    `;

    if (!orderResult || orderResult.length === 0) {
      throw new Error('Failed to create order in database');
    }

    // Insert order items
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

    console.log('PayPal order captured and created successfully:', {
      cid,
      paypalOrderId,
      orderId,
      captureId,
      totalAmount: capturedAmount,
      payerEmail,
      payerName,
      finalEmail
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        orderId,
        cid
      }),
    };

  } catch (error) {
    console.error('PayPal capture order error:', error, 'cid:', cid);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);

    // Return more detailed error information for debugging
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'INTERNAL_ERROR',
        debug: {
          message: error.message,
          type: error.constructor.name,
          cid,
          timestamp: new Date().toISOString()
        },
        cid
      }),
    };
  }
};
