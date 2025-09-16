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

    console.log('Updating test order with new file key...');

    const testFileKey = 'uploads/1758000049266-d5c593fc-0415-4c94-91a2-9850f08ff119-test-banner.jpg';
    const orderId = '0170cd07-df3c-4e0f-80bf-89c36012ef36';

    // Update the order item with the test file_key
    await sql`
      UPDATE order_items 
      SET file_key = ${testFileKey}
      WHERE order_id = ${orderId}
    `;

    console.log('Test order updated successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'Test order updated successfully',
        orderId: orderId,
        fileKey: testFileKey
      })
    };

  } catch (error) {
    console.error('Update failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Update failed',
        details: error.message
      })
    };
  }
};
