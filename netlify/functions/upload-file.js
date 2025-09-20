const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');
const Busboy = require('busboy'); // Import Busboy

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

  return new Promise((resolve) => {
    const busboy = Busboy({ headers: event.headers });
    let fileContent = '';
    let filename = '';
    let contentType = '';
    let fileSize = 0;
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

    busboy.on('file', (fieldname, file, info) => {
      const { filename: originalFilename, encoding, mimeType } = info;
      filename = originalFilename;
      contentType = mimeType;

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(contentType)) {
        resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.' }),
        });
        file.resume(); // Consume the stream to prevent 'finish' event from hanging
        return;
      }

      file.on('data', (data) => {
        fileContent += data.toString('base64');
        fileSize += data.length;

        if (fileSize > MAX_FILE_SIZE) {
          resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: `File size exceeds the 20MB limit. Current size: ${Math.round(fileSize / (1024 * 1024))}MB` }),
          });
          file.resume(); // Consume the stream to prevent 'finish' event from hanging
        }
      });

      file.on('end', () => {
        console.log('File [' + fieldname + '] finished');
      });
    });

    busboy.on('field', (fieldname, val, info) => {
      // Handle other fields if necessary
      console.log(`Field [${fieldname}]: ${val}`);
    });

    busboy.on('finish', async () => {
      if (!filename) {
        resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'No file uploaded or filename is missing.' }),
        });
        return;
      }

      if (!fileContent) {
        resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'File content is empty.' }),
        });
        return;
      }

      try {
        console.log('File upload received:', { filename, fileSize, contentType, hasContent: !!fileContent });

        // Generate a unique file key with original filename
        const timestamp = Date.now();
        const uuid = randomUUID();
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `uploads/${timestamp}-${uuid}-${sanitizedFilename}`;

        console.log('Generated file key:', fileKey);

        // Store file content and metadata in database
        await sql`
          INSERT INTO uploaded_files (id, file_key, original_filename, file_size, mime_type, file_content_base64, upload_timestamp, status)
          VALUES (${randomUUID()}, ${fileKey}, ${filename}, ${fileSize}, ${contentType}, ${fileContent}, ${new Date().toISOString()}, 'uploaded')
          ON CONFLICT (file_key) DO NOTHING
        `;

        resolve({
          statusCode: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            success: true,
            fileKey: fileKey,
            filename: filename,
            size: fileSize,
            contentType: contentType,
            message: 'File uploaded successfully with content'
          }),
        });
      } catch (error) {
        console.error('Error in upload-file function:', error);
        resolve({
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Internal server error',
            message: error.message
          }),
        });
      }
    });

    busboy.on('error', (err) => {
      console.error('Busboy error:', err);
      resolve({
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'File upload parsing error', message: err.message }),
      });
    });

    busboy.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
  });
};