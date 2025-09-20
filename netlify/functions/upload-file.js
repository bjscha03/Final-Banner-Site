const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');
const Busboy = require('busboy'); // Use require for Busboy in Netlify functions

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  return new Promise((resolve) => {
    const busboy = Busboy({ headers: event.headers });

    let fileBuffer = Buffer.from([]);
    let fileMime = "";
    let fileName = "";
    let fileSize = 0;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    busboy.on("file", (fieldname, file, info) => {
      // Accept both 'file' and 'pdf' as field names
      if (fieldname !== 'file' && fieldname !== 'pdf') {
        resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid field name. Expected 'file' or 'pdf'." }),
        });
        file.resume();
        return;
      }

      fileName = info.filename;
      fileMime = info.mimeType;

      // Validate file type immediately
      if (fileMime !== "application/pdf") {
        resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Only PDF files allowed" }),
        });
        file.resume();
        return;
      }

      file.on("data", (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
        fileSize += data.length;

        if (fileSize > MAX_FILE_SIZE) {
          resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: `File size exceeds the 10MB limit. Current size: ${Math.round(fileSize / (1024 * 1024))}MB` }),
          });
          file.resume(); // Consume the stream to prevent 'finish' event from hanging
        }
      });

      file.on("end", () => {
        console.log(`File [${fileName}] uploaded, size: ${fileBuffer.length}`);
      });
    });

    busboy.on("finish", async () => {
      if (!fileName) {
        return resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "No file uploaded" }),
        });
      }

      if (fileMime !== "application/pdf") {
        return resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Only PDF files allowed" }),
        });
      }

      if (fileSize > MAX_FILE_SIZE) {
        return resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `File size exceeds the 10MB limit. Current size: ${Math.round(fileSize / (1024 * 1024))}MB` }),
        });
      }

      try {
        // Generate a unique file key with original filename
        const timestamp = Date.now();
        const uuid = randomUUID();
        const sanitizedFilename = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `uploads/${timestamp}-${uuid}-${sanitizedFilename}`;

        console.log('Generated file key:', fileKey);

        // Store file content and metadata in database
        await sql`
          INSERT INTO uploaded_files (id, file_key, original_filename, file_size, mime_type, file_content_base64, upload_timestamp, status)
          VALUES (${randomUUID()}, ${fileKey}, ${fileName}, ${fileSize}, ${fileMime}, ${fileBuffer.toString('base64')}, ${new Date().toISOString()}, 'uploaded')
          ON CONFLICT (file_key) DO NOTHING
        `;

        resolve({
          statusCode: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: "File uploaded successfully",
            filename: fileName,
            size: fileSize,
            fileKey: fileKey // Include fileKey in the response
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