const { neon } = require('@neondatabase/serverless');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

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
    const { key, order, fileKey } = event.queryStringParameters || {};

    // Handle thumbnail requests (fileKey parameter) without order verification
    const requestedKey = fileKey || key;

    if (!requestedKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameter: key, fileKey, or order' }),
      };
    }

    console.log('File download request:', { key, order, fileKey, requestedKey });

    // For thumbnail requests (fileKey parameter), skip order verification
    if (!fileKey && (!key || !order)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters: key and order (for order downloads)' }),
      };
    }

    // Verify the order exists and contains the file (only for order-based downloads)
    if (!fileKey && key && order) {
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
    }

    // Extract bucket name and key from the S3 URL (requestedKey)
    const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
    const S3_REGION = process.env.S3_REGION || "us-east-1";

    if (!S3_BUCKET_NAME) {
      console.error("S3_BUCKET_NAME environment variable not set.");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "S3_BUCKET_NAME environment variable not set." }),
      };
    }

    const s3Client = new S3Client({ region: S3_REGION });

    // Assuming requestedKey is the full S3 URL, extract the path part
    const url = new URL(requestedKey);
    const s3Key = url.pathname.substring(1); // Remove leading slash

    const getObjectParams = {
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
    };

    console.log('Attempting to download from S3:', getObjectParams);

    const { Body, ContentType, ContentLength } = await s3Client.send(new GetObjectCommand(getObjectParams));

    const fileBuffer = await Body.transformToByteArray();
    const base64File = Buffer.from(fileBuffer).toString('base64');

    const fileName = s3Key.split('/').pop() || 'download';

    // For thumbnail requests (fileKey parameter), serve inline; for order downloads, serve as attachment
    const isThumbailRequest = !!fileKey;
    const contentDisposition = isThumbailRequest
      ? 'inline'
      : `attachment; filename="${fileName}"`;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': ContentType || 'application/octet-stream',
        'Content-Disposition': contentDisposition,
        'Content-Length': ContentLength.toString(),
        'Cache-Control': isThumbailRequest ? 'public, max-age=3600' : 'private, no-cache', // Cache thumbnails for 1 hour
      },
      body: base64File,
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
