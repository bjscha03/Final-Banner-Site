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

    console.log('Updating test order with real file content...');

    const testFileKey = 'uploads/1758000613788-135b2d5e-17ba-4221-a4c8-1a04fbf0c7c0-test-image.jpg';
    const orderId = '0170cd07-df3c-4e0f-80bf-89c36012ef36';

    // Update the order item with the test file_key
    await sql`
      UPDATE order_items 
      SET file_key = ${testFileKey}
      WHERE order_id = ${orderId}
    `;

    console.log('Test order updated with real file content');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'Test order updated with real file content',
        orderId: orderId,
        fileKey: testFileKey,
        downloadUrl: `/.netlify/functions/download-file?key=${encodeURIComponent(testFileKey)}&order=${orderId}`
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
