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

    // Retrieve the actual file from the uploaded_files table
    const fileResult = await sql`
      SELECT file_key, original_filename, file_size, mime_type, file_content_base64
      FROM uploaded_files
      WHERE file_key = ${key}
      LIMIT 1
    `;

    if (!fileResult || fileResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'File not found in storage' }),
      };
    }

    const fileRecord = fileResult[0];
    console.log('File found in storage:', {
      filename: fileRecord.original_filename,
      size: fileRecord.file_size,
      mimeType: fileRecord.mime_type
    });

    // Convert base64 back to binary
    const fileContent = Buffer.from(fileRecord.file_content_base64, 'base64');
    const fileName = fileRecord.original_filename || key.split('/').pop() || 'banner-design.bin';

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': fileRecord.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileContent.length.toString(),
      },
      body: fileContent.toString('base64'),
      isBase64Encoded: true,
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
