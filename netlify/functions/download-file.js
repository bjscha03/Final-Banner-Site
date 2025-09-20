const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
    const { key, order, fileKey, download } = event.queryStringParameters || {};

    // Handle thumbnail requests (fileKey parameter) without order verification
    const requestedKey = fileKey || key;

    if (!requestedKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameter: key, fileKey, or order' }),
      };
    }

    console.log('File download request:', { key, order, fileKey, requestedKey, download });

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
      try {
        const orderResult = await sql`
          SELECT o.id, o.email, oi.file_key
          FROM orders o
          JOIN order_items oi ON o.id = oi.order_id
          WHERE o.id = ${order} AND oi.file_key = ${key}
          LIMIT 1
        `;

        if (!orderResult || orderResult.length === 0) {
          console.log('Order verification failed:', { order, key, resultCount: orderResult?.length || 0 });
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'File not found or access denied' }),
          };
        }

        console.log('Order verified for file download:', orderResult[0]);
      } catch (dbError) {
        console.error('Database error during order verification:', dbError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: 'Database error during order verification',
            message: dbError.message 
          }),
        };
      }
    }

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error("Cloudinary environment variables not set.");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Cloudinary configuration missing." }),
      };
    }

    console.log('Attempting to download from Cloudinary:', requestedKey);

    // For thumbnail requests, we can use Cloudinary's transformation API
    const isThumbailRequest = !!fileKey && download !== 'true';
    
    if (isThumbailRequest) {
      // For thumbnails, generate a Cloudinary URL with transformations
      let cloudinaryUrl;
      
      // Check if it's a PDF or image
      const isPdf = requestedKey.includes('.pdf') || requestedKey.includes('raw');
      
      if (isPdf) {
        // For PDFs, use the raw resource type and generate a thumbnail
        cloudinaryUrl = cloudinary.url(requestedKey, {
          resource_type: 'raw',
          format: 'jpg',
          page: 1,
          width: 150,
          height: 150,
          crop: 'fill',
          quality: 'auto'
        });
      } else {
        // For images, use standard image transformations
        cloudinaryUrl = cloudinary.url(requestedKey, {
          resource_type: 'image',
          width: 150,
          height: 150,
          crop: 'fill',
          quality: 'auto'
        });
      }
      
      console.log('Generated Cloudinary thumbnail URL:', cloudinaryUrl);
      
      // Redirect to the Cloudinary URL for thumbnails
      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': cloudinaryUrl,
          'Cache-Control': 'public, max-age=3600', // Cache thumbnails for 1 hour
        },
        body: '',
      };
    } else {
      // For file downloads, we need to fetch the file and serve it
      try {
        // Generate the download URL from Cloudinary using the same approach as thumbnails
        // but without transformations
        let downloadUrl;
        
        // Check if it's a PDF or image to determine resource type
        const isPdf = requestedKey.includes('.pdf') || requestedKey.includes('raw');
        
        if (isPdf) {
          // For PDFs, use the raw resource type
          downloadUrl = cloudinary.url(requestedKey, {
            resource_type: 'raw',
            flags: 'attachment'
          });
        } else {
          // For images, use standard image resource type
          downloadUrl = cloudinary.url(requestedKey, {
            resource_type: 'image',
            flags: 'attachment'
          });
        }
        
        console.log('Generated Cloudinary download URL:', downloadUrl);
        
        // Fetch the file from Cloudinary
        const response = await fetch(downloadUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch file from Cloudinary: ${response.status} ${response.statusText}`);
        }
        
        const fileBuffer = await response.arrayBuffer();
        const base64File = Buffer.from(fileBuffer).toString('base64');
        
        // Extract filename from the public ID
        const fileName = requestedKey.split('/').pop()?.replace(/^.*-/, '') || 'download';
        
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
    }

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
