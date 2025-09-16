const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    // For now, simulate file upload by accepting JSON data with file info
    // This is a temporary approach until we can properly handle multipart uploads

    let requestData;
    try {
      requestData = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    const { filename, size, contentType, fileContent } = requestData;

    if (!filename) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Filename is required' }),
      };
    }

    if (!fileContent) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'File content is required' }),
      };
    }

    console.log('File upload received:', { filename, size, contentType, hasContent: !!fileContent });

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (contentType && !allowedTypes.includes(contentType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.' }),
      };
    }

    // Generate a unique file key with original filename
    const timestamp = Date.now();
    const uuid = randomUUID();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `uploads/${timestamp}-${uuid}-${sanitizedFilename}`;

    console.log('Generated file key:', fileKey);

    // Store file content and metadata in database
    await sql`
      INSERT INTO uploaded_files (id, file_key, original_filename, file_size, mime_type, file_content_base64, upload_timestamp, status)
      VALUES (${randomUUID()}, ${fileKey}, ${filename}, ${size || 0}, ${contentType || 'application/octet-stream'}, ${fileContent}, ${new Date().toISOString()}, 'uploaded')
      ON CONFLICT (file_key) DO NOTHING
    `;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        fileKey: fileKey,
        filename: filename,
        size: size || 0,
        contentType: contentType || 'application/octet-stream',
        message: 'File uploaded successfully with content'
      }),
    };

  } catch (error) {
    console.error('Error in upload-file function:', error);
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
