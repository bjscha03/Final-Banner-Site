const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

// Helper function to check if file exists
// In production, this would check your cloud storage service
async function checkFileExists(fileKey) {
  try {
    // For development, simulate file existence based on file key pattern
    // In production, you would check your actual storage service
    return fileKey && fileKey.includes('uploads/');
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
}

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

    // Check if file exists in our simulated storage
    // In production, you would retrieve the actual file from cloud storage
    const fileExists = await checkFileExists(key);

    if (!fileExists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'File not found in storage' }),
      };
    }

    // For development/demo purposes, create a sample file content
    // In production, you would retrieve the actual file from storage
    const fileName = key.split('/').pop() || 'banner-design.txt';
    const fileContent = `Sample banner design file for order ${order}\nFile key: ${key}\nGenerated at: ${new Date().toISOString()}\n\nThis is a placeholder file for development purposes.\nIn production, this would be the actual customer-uploaded design file.`;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': Buffer.byteLength(fileContent, 'utf8').toString(),
      },
      body: fileContent,
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
