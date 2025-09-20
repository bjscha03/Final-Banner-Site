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

  try {
    console.log('=== DEBUG ADMIN DOWNLOADS ===');
    
    // Get sample orders with file keys from the database
    const sampleOrders = await sql`
      SELECT 
        o.id as order_id, 
        o.status, 
        o.created_at,
        oi.id as item_id,
        oi.file_key, 
        oi.file_url,
        LENGTH(oi.file_key) as file_key_length,
        oi.width_in,
        oi.height_in,
        oi.material
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE oi.file_key IS NOT NULL
      ORDER BY o.created_at DESC
      LIMIT 10
    `;

    // Test URL construction for each file key
    const urlTests = sampleOrders.map(order => {
      const fileKey = order.file_key;
      const encodedFileKey = encodeURIComponent(fileKey);
      const downloadUrl = `/.netlify/functions/download-file?fileKey=${encodedFileKey}&download=true`;
      
      return {
        order_id: order.order_id.slice(-8),
        original_file_key: fileKey,
        file_key_length: order.file_key_length,
        encoded_file_key: encodedFileKey,
        download_url: downloadUrl,
        thumbnail_url: `/.netlify/functions/download-file?fileKey=${encodedFileKey}`,
        file_key_preview: fileKey ? fileKey.substring(0, 50) + (fileKey.length > 50 ? '...' : '') : null
      };
    });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Debug info for admin downloads',
        total_orders_with_files: sampleOrders.length,
        sample_orders: sampleOrders,
        url_construction_tests: urlTests
      }, null, 2),
    };

  } catch (error) {
    console.error('Debug function error:', error);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Debug function error',
        message: error.message,
        stack: error.stack
      }),
    };
  }
};
