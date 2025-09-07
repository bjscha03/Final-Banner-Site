const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const sql = neon(dbUrl);
    const params = new URLSearchParams(event.rawQuery || '');
    const orderId = params.get('id');

    if (!orderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }

    // Get order details
    const orderResult = await sql`
      SELECT 
        id, 
        order_number, 
        user_id, 
        email, 
        subtotal_cents, 
        tax_cents, 
        total_cents, 
        status, 
        tracking_number, 
        tracking_carrier, 
        created_at, 
        updated_at
      FROM orders 
      WHERE id = ${orderId}
    `;

    if (orderResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    const order = orderResult[0];

    // Get order items
    const itemsResult = await sql`
      SELECT 
        width_in, 
        height_in, 
        quantity, 
        material, 
        grommets, 
        rope_feet, 
        pole_pockets, 
        line_total_cents
      FROM order_items 
      WHERE order_id = ${orderId}
      ORDER BY created_at
    `;

    // Combine order with items
    const orderWithItems = {
      ...order,
      items: itemsResult
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        order: orderWithItems
      })
    };

  } catch (error) {
    console.error('Error fetching order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Failed to fetch order details',
        details: error.message
      })
    };
  }
};
