// netlify/functions/paypal-capture-simple.js
// Backward compatibility proxy to paypal-capture-order.js
const mod = require('./paypal-capture-order.js');
exports.handler = (event, ctx) => mod.handler(event, ctx);



const capturePayPalOrder = async (orderId, accessToken, requestId) => {
  const { baseUrl } = getPayPalCredentials();

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };

  // Add idempotency header if provided
  if (requestId) {
    headers['PayPal-Request-Id'] = requestId;
  }

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers,
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
      // Generate idempotency key for PayPal request
      const requestId = `${cid}-${paypalOrderId}`;

      // Capture the PayPal order
      captureDetails = await capturePayPalOrder(paypalOrderId, accessToken, requestId);
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
    console.error('PayPal capture unexpected error:', error, 'cid:', cid);

    // Determine specific error type based on error message
    let errorType = 'INTERNAL_ERROR';
    if (error.message?.includes('PayPal credentials not configured')) {
      errorType = 'PAYPAL_CONFIG_ERROR';
    } else if (error.message?.includes('PayPal auth failed')) {
      errorType = 'PAYPAL_AUTH_ERROR';
    } else if (error.message?.includes('PayPal capture failed')) {
      errorType = 'PAYPAL_CAPTURE_ERROR';
    } else if (error.message?.includes('Database')) {
      errorType = 'DATABASE_ERROR';
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: errorType,
        message: error.message,
        cid
      }),
    };
  }
};
