const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const cid = randomUUID().substring(0, 8);
  
  try {
    console.log('=== Test PayPal Capture ===', { cid });
    
    // Basic environment check
    if (!process.env.NETLIFY_DATABASE_URL) {
      console.error('Database URL not configured:', 'cid:', cid);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'DATABASE_NOT_CONFIGURED', cid }),
      };
    }

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

    console.log('Payload received:', { 
      hasPaypalOrderId: !!payload.paypalOrderId,
      hasCartItems: !!payload.cartItems,
      cartItemsLength: payload.cartItems?.length,
      hasUserEmail: !!payload.userEmail,
      cid 
    });

    const { paypalOrderId, cartItems, userEmail, userId } = payload;

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

    // Test database connection
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    
    // Simple test - just return success for now
    console.log('Test PayPal capture - basic validation passed:', { cid, paypalOrderId });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'Test PayPal capture - validation passed',
        cid,
        paypalOrderId,
        cartItemsCount: cartItems.length
      }),
    };

  } catch (error) {
    console.error('Test PayPal capture error:', error, 'cid:', cid);
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
