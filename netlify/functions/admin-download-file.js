const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Neon database connection

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

    // Initialize database connection
    const sql = neon(process.env.NETLIFY_DATABASE_URL);  }

  try {
    const { fileKey } = event.queryStringParameters || {};

    if (!fileKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameter: fileKey' }),
      };
    }

    console.log('Admin file download request:', { fileKey });

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error("Cloudinary environment variables not set.");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Cloudinary configuration missing." }),
      };
    }

    console.log('Attempting to download from Cloudinary:', fileKey);

    // For admin downloads, fetch the file and serve it as a download
    try {
      // Generate the download URL from Cloudinary
      const downloadUrl = cloudinary.url(fileKey, {
        resource_type: 'auto',
        flags: 'attachment'
      });
      
      console.log('Generated Cloudinary download URL:', downloadUrl);
      
      // Fetch the file from Cloudinary
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file from Cloudinary: ${response.status} ${response.statusText}`);
      }
      
      const fileBuffer = await response.arrayBuffer();
      const base64File = Buffer.from(fileBuffer).toString('base64');
      
      // Extract filename from the public ID
      const fileName = fileKey.split('/').pop()?.replace(/^.*-/, '') || 'download';
      
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.byteLength.toString(),
          'Cache-Control': 'private, no-cache',
        },
        body: base64File,
        isBase64Encoded: true,
      };
      
    } catch (fetchError) {
      console.error('Error fetching file from Cloudinary:', fetchError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'File not found',
          message: fetchError.message 
        }),
      };
    }

  } catch (error) {
    console.error('Error in admin-download-file function:', error);
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
