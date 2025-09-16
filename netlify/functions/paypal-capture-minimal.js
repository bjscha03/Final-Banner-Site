// Minimal PayPal capture - no DB, just capture
exports.handler = async (event) => {
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

    // Get PayPal token
    const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
    const secret = process.env.PAYPAL_SECRET_SANDBOX;
    
    if (!clientId || !secret) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayPal credentials missing' }) };
    }

    const tokenResponse = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayPal auth failed' }) };
    }

    const { access_token } = await tokenResponse.json();

    // Capture the order
    const captureResponse = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok) {
      return { 
        statusCode: captureResponse.status, 
        headers, 
        body: JSON.stringify({ 
          error: 'PayPal capture failed', 
          details: captureData 
        }) 
      };
    }

    // Create a simple order record in database
    const { neon } = require('@neondatabase/serverless');
    const { randomUUID } = require('crypto');

    try {
      const sql = neon(process.env.NETLIFY_DATABASE_URL);
      const orderId = randomUUID();

      // Create basic order record
      await sql`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents, status
        )
        VALUES (
          ${orderId}, null, ${captureData.payer?.email_address || 'unknown@example.com'},
          1000, 60, 1060, 'paid'
        )
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          data: captureData,
          orderId: orderId,
          message: 'Payment captured and order created successfully'
        })
      };
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Return success anyway since PayPal payment worked
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          data: captureData,
          orderId: orderID, // Use PayPal order ID as fallback
          message: 'Payment captured successfully (order creation failed)'
        })
      };
    }

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Function error', 
        message: error.message 
      })
    };
  }
};
