const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const { key, order } = event.queryStringParameters || {};

    if (!key || !order) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters: key and order' }),
      };
    }

    console.log('File download request:', { key, order });

    // Verify the order exists and contains the file
    const orderResult = await sql`
      SELECT o.id, o.email, oi.file_key
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = ${order} AND oi.file_key = ${key}
      LIMIT 1
    `;

    if (!orderResult || orderResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'File not found or access denied' }),
      };
    }

    console.log('Order verified for file download:', orderResult[0]);

    // In a real implementation, you would:
    // 1. Retrieve the file from your storage service (AWS S3, Google Cloud Storage, etc.)
    // 2. Generate a signed URL or stream the file content
    // 3. Return the file with appropriate headers

    // For now, we'll return a placeholder response indicating the download would work
    // In production, you'd replace this with actual file serving logic
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'File download endpoint working',
        fileKey: key,
        orderId: order,
        note: 'In production, this would serve the actual file content'
      }),
    };

  } catch (error) {
    console.error('Error in download-file function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
    };
  }
};
