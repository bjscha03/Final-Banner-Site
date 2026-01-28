const { neon } = require('@neondatabase/serverless');

// Neon database connection
// Lazily initialize Neon with whichever DB URL is available
function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}


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
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      console.error('Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'Set NETLIFY_DATABASE_URL or VITE_DATABASE_URL or DATABASE_URL'
        }),
      };
    }

    const sql = neon(dbUrl);

    const { user_id, page = 1 } = event.queryStringParameters || {};
    const limit = 20;
    const offset = (page - 1) * limit;

    let orders;

    if (user_id) {
      // Get orders for specific user
      console.log('Fetching orders for user:', user_id);
      orders = await sql`
        SELECT id, user_id, email, subtotal_cents, tax_cents, total_cents,
               status, tracking_number, created_at, updated_at
        FROM orders
        WHERE user_id = ${user_id}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // Get all orders (admin view)
      console.log('Fetching all orders');
      orders = await sql`
        SELECT id, user_id, email, subtotal_cents, tax_cents, total_cents,
               status, tracking_number, created_at, updated_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    console.log(`Found ${orders.length} orders`);

    // Format the response - only use columns that definitely exist
    const formattedOrders = orders.map(order => ({
      id: order.id,
      user_id: order.user_id,
      email: order.email,
      subtotal_cents: order.subtotal_cents,
      tax_cents: order.tax_cents,
      total_cents: order.total_cents,
      status: order.status,
      currency: 'USD',
      tracking_number: order.tracking_number,
      tracking_carrier: order.tracking_number ? 'fedex' : null,
      created_at: order.created_at,
      items: []
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
