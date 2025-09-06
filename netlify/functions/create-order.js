const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
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

    const orderData = JSON.parse(event.body);
    console.log('Creating order with data:', orderData);
    console.log('Database URL available:', !!process.env.NETLIFY_DATABASE_URL);

    // Generate UUID for the order
    const orderId = randomUUID();
    
    // First, let's test if we can connect to the database
    console.log('Testing database connection...');
    const testResult = await sql`SELECT 1 as test`;
    console.log('Database connection successful:', testResult);

    // Check if tables exist
    console.log('Checking if orders table exists...');
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'orders'
      );
    `;
    console.log('Orders table exists:', tableCheck);

    // Insert order into database
    console.log('Inserting order with ID:', orderId);
    const orderResult = await sql`
      INSERT INTO orders (id, user_id, email, subtotal_cents, tax_cents, total_cents, status, created_at, updated_at)
      VALUES (${orderId}, ${orderData.user_id}, ${'guest@example.com'}, ${orderData.subtotal_cents}, ${orderData.tax_cents}, ${orderData.total_cents}, 'paid', NOW(), NOW())
      RETURNING *
    `;

    if (!orderResult || orderResult.length === 0) {
      throw new Error('Failed to create order');
    }

    const order = orderResult[0];
    console.log('Order created:', order);

    // Insert order items
    for (const item of orderData.items) {
      console.log('Inserting order item:', item);
      await sql`
        INSERT INTO order_items (id, order_id, width_in, height_in, quantity, material, grommets, rope_feet, pole_pockets, line_total_cents, created_at)
        VALUES (${randomUUID()}, ${orderId}, ${item.width_in}, ${item.height_in}, ${item.quantity}, ${item.material}, ${item.grommets || 'none'}, ${item.rope_feet || 0}, false, ${item.line_total_cents}, NOW())
      `;
    }

    console.log('All order items created successfully');

    // Return the order object
    const response = {
      id: orderId,
      user_id: orderData.user_id,
      subtotal_cents: orderData.subtotal_cents,
      tax_cents: orderData.tax_cents,
      total_cents: orderData.total_cents,
      status: 'paid',
      currency: orderData.currency,
      tracking_number: null,
      tracking_carrier: null,
      created_at: order.created_at,
      items: orderData.items
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error creating order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create order', 
        details: error.message 
      }),
    };
  }
};
