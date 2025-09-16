const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
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
        body: JSON.stringify({
          ok: false,
          error: 'Database not configured'
        })
      };
    }

    const sql = neon(dbUrl);

    console.log('Adding test file_key to an order item...');

    // Find the first order item without a file_key
    const orderItems = await sql`
      SELECT id, order_id 
      FROM order_items 
      WHERE file_key IS NULL 
      LIMIT 1
    `;

    if (orderItems.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'No order items found without file_key'
        })
      };
    }

    const orderItem = orderItems[0];
    const testFileKey = 'uploads/test-banner-design.png';

    // Update the order item with a test file_key
    await sql`
      UPDATE order_items 
      SET file_key = ${testFileKey}
      WHERE id = ${orderItem.id}
    `;

    console.log('Test file_key added successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'Test file_key added successfully',
        orderItemId: orderItem.id,
        orderId: orderItem.order_id,
        fileKey: testFileKey
      })
    };

  } catch (error) {
    console.error('Test failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Test failed',
        details: error.message
      })
    };
  }
};
