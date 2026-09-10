const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');
const { requireAdmin } = require('../server-auth.cjs');

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
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { key, order, fileKey, download } = event.queryStringParameters || {};

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
    if (!key || !order) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters: key and order (for order downloads)' }),
      };
    }

    // Verify the order exists and contains the file (only for order-based downloads)
    if (key && order) {
      try {
        // Check if the key matches file_key OR is contained in overlay_image/overlay_images JSON
        // This handles both old orders (file_key) and new orders (overlay_image.fileKey)
        const orderResult = await sql`
          SELECT o.id, o.email, oi.file_key, oi.file_url, oi.file_name, oi.original_filename, oi.artwork_manifest,
                 oi.final_print_pdf_url, oi.generated_print_pdf_url
          FROM orders o
          JOIN order_items oi ON o.id = oi.order_id
          WHERE o.id = ${order} AND (
            oi.file_key = ${key}
            OR oi.file_url = ${key}
            OR oi.artwork_manifest->>'publicId' = ${key}
            OR oi.artwork_manifest->>'originalUrl' = ${key}
            OR oi.final_print_pdf_url = ${key}
            OR oi.generated_print_pdf_url = ${key}
          )
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

        console.log('Order verified for original artwork download');
        event.__verifiedArtwork = orderResult[0];
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

    console.log('Attempting authenticated original artwork download');

    const manifest = event.__verifiedArtwork?.artwork_manifest || {};
    const isFinalFile = requestedKey === event.__verifiedArtwork?.final_print_pdf_url;
    const isGeneratedPdf = requestedKey === event.__verifiedArtwork?.generated_print_pdf_url;
    const originalFilename = isFinalFile ? 'final-approved-production.pdf'
      : isGeneratedPdf ? 'generated-production.pdf'
        : manifest.originalFilename || event.__verifiedArtwork?.original_filename || event.__verifiedArtwork?.file_name || 'customer-artwork';
    if (/^https?:\/\//i.test(requestedKey)) {
      const response = await fetch(requestedKey);
      if (!response.ok) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Original artwork is unavailable' }) };
      const fileBuffer = Buffer.from(await response.arrayBuffer());
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': response.headers.get('content-type') || manifest.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(originalFilename)}`,
          'Cache-Control': 'private, no-store',
        },
        body: fileBuffer.toString('base64'),
        isBase64Encoded: true,
      };
    }

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
      // For file downloads, redirect to Cloudinary URL with attachment flag
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
        // For images, use standard image resource type with attachment flag
        downloadUrl = cloudinary.url(requestedKey, {
          resource_type: 'image',
          flags: 'attachment'
        });
      }
      
      console.log('Generated Cloudinary download URL:', downloadUrl);
      
      // Redirect to the Cloudinary URL for downloads
      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': downloadUrl,
          'Cache-Control': 'private, no-cache',
        },
        body: '',
      };
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

