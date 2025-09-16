const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');
const multipart = require('lambda-multipart-parser');

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
    // Parse the multipart form data
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Content-Type must be multipart/form-data' }),
      };
    }

    // Parse the multipart form data to extract the file
    const result = await multipart.parse(event);

    if (!result.files || result.files.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file uploaded' }),
      };
    }

    const file = result.files[0];
    console.log('File upload received:', {
      filename: file.filename,
      contentType: file.contentType,
      size: file.content.length
    });

    // Validate file type and size
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = 100 * 1024 * 1024; // 100MB

    if (!allowedTypes.includes(file.contentType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.' }),
      };
    }

    if (file.content.length > maxSize) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'File too large. Maximum size is 100MB.' }),
      };
    }

    // Generate a unique file key with original filename
    const timestamp = Date.now();
    const uuid = randomUUID();
    const extension = file.filename.split('.').pop() || 'bin';
    const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `uploads/${timestamp}-${uuid}-${sanitizedFilename}`;

    console.log('Generated file key:', fileKey);

    // Store file content in database (for development - in production use cloud storage)
    // Convert buffer to base64 for storage
    const fileContentBase64 = file.content.toString('base64');

    await sql`
      INSERT INTO uploaded_files (id, file_key, original_filename, file_size, mime_type, file_content_base64, upload_timestamp, status)
      VALUES (${randomUUID()}, ${fileKey}, ${file.filename}, ${file.content.length}, ${file.contentType}, ${fileContentBase64}, ${new Date().toISOString()}, 'uploaded')
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
        filename: file.filename,
        size: file.content.length,
        contentType: file.contentType,
        message: 'File uploaded successfully'
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
