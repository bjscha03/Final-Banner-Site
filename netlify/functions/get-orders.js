const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Check if database URL is available
    if (!process.env.NETLIFY_DATABASE_URL) {
      console.error('NETLIFY_DATABASE_URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Database configuration missing',
          details: 'NETLIFY_DATABASE_URL environment variable not set'
        }),
      };
    }

    const { user_id, page = 1 } = event.queryStringParameters || {};
    const limit = 20;
    const offset = (page - 1) * limit;

    let orders;
    
    if (user_id) {
      // Get orders for specific user
      console.log('Fetching orders for user:', user_id);
      orders = await sql`
        SELECT o.*,
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', oi.grommets,
                   'rope_feet', COALESCE(oi.rope_feet, 0),
                   'pole_pockets', oi.pole_pockets,
                   'area_sqft', COALESCE(oi.area_sqft, (oi.width_in * oi.height_in / 144.0)),
                   'unit_price_cents', COALESCE(oi.unit_price_cents, oi.line_total_cents / oi.quantity),
                   'line_total_cents', oi.line_total_cents,
                   'file_key', oi.file_key
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ${user_id}
        GROUP BY o.id, o.user_id, o.email, o.subtotal_cents, o.tax_cents, o.total_cents, o.status, o.tracking_number, o.created_at, o.updated_at
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // Get all orders (admin view)
      console.log('Fetching all orders');
      orders = await sql`
        SELECT o.*,
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', oi.grommets,
                   'rope_feet', COALESCE(oi.rope_feet, 0),
                   'pole_pockets', oi.pole_pockets,
                   'area_sqft', COALESCE(oi.area_sqft, (oi.width_in * oi.height_in / 144.0)),
                   'unit_price_cents', COALESCE(oi.unit_price_cents, oi.line_total_cents / oi.quantity),
                   'line_total_cents', oi.line_total_cents,
                   'file_key', oi.file_key
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id, o.user_id, o.email, o.subtotal_cents, o.tax_cents, o.total_cents, o.status, o.tracking_number, o.created_at, o.updated_at
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    console.log(`Found ${orders.length} orders`);

    // Format the response
    const formattedOrders = orders.map(order => ({
      id: order.id,
      user_id: order.user_id,
      subtotal_cents: order.subtotal_cents,
      tax_cents: order.tax_cents,
      total_cents: order.total_cents,
      status: order.status,
      currency: 'USD',
      tracking_number: order.tracking_number,
      tracking_carrier: order.tracking_carrier,
      created_at: order.created_at,
      items: order.items || []
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedOrders),
    };
  } catch (error) {
    console.error('Error fetching orders:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch orders', 
        details: error.message 
      }),
    };
  }
};
