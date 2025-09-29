const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
    const { fileKey } = event.queryStringParameters || {};

    if (!fileKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameter: fileKey' }),
      };
    }

    console.log('Enhanced admin file download request:', { fileKey });

    // Initialize database connection
    const sql = neon(process.env.NETLIFY_DATABASE_URL);

    // For admin downloads, check if this is an AI image and generate print-ready version
    try {
      // First, try to find order item information to get banner dimensions
      let orderItem = null;
      try {
        const orderItems = await sql`
          SELECT width_in, height_in, ai_design_metadata 
          FROM order_items 
          WHERE file_key = ${fileKey}
          LIMIT 1
        `;
        orderItem = orderItems[0];
        console.log('Found order item:', orderItem);
      } catch (dbError) {
        console.log('Could not find order item, proceeding with standard download:', dbError.message);
      }

      let downloadUrl;
      let filename = fileKey.split('/').pop() || 'download';
      
      // If we have order item with dimensions and it's an AI image, generate print-ready version
      if (orderItem && orderItem.width_in && orderItem.height_in && orderItem.ai_design_metadata) {
        console.log(`🖨️ Generating print-ready version for admin download: ${orderItem.width_in}×${orderItem.height_in}"`);
        
        // Calculate print-ready dimensions
        const targetDPI = 150; // Good balance for print quality
        const targetWidthPx = Math.round(orderItem.width_in * targetDPI);
        const targetHeightPx = Math.round(orderItem.height_in * targetDPI);
        
        // Check Cloudinary limits (25 megapixels)
        const totalPixels = targetWidthPx * targetHeightPx;
        const maxPixels = 25000000;
        
        let finalWidthPx = targetWidthPx;
        let finalHeightPx = targetHeightPx;
        let actualDPI = targetDPI;
        
        if (totalPixels > maxPixels) {
          const scaleFactor = Math.sqrt(maxPixels / totalPixels);
          finalWidthPx = Math.round(targetWidthPx * scaleFactor);
          finalHeightPx = Math.round(targetHeightPx * scaleFactor);
          actualDPI = Math.round(targetDPI * scaleFactor);
          console.log(`⚠️ Scaled down for Cloudinary limits: ${finalWidthPx}×${finalHeightPx}px at ${actualDPI} DPI`);
        }

        // Generate print-ready URL
        downloadUrl = cloudinary.url(fileKey, {
          resource_type: 'image',
          width: finalWidthPx,
          height: finalHeightPx,
          crop: 'fill',
          gravity: 'center',
          format: 'png',
          quality: 'auto:best',
          flags: 'progressive.attachment'
        });
        
        filename = `${filename.replace(/\.[^/.]+$/, '')}_print_ready_${orderItem.width_in}x${orderItem.height_in}_${actualDPI}dpi.png`;
        console.log(`✅ Generated print-ready download URL at ${actualDPI} DPI`);
      } else {
        // Standard download for non-AI images or when dimensions not available
        downloadUrl = cloudinary.url(fileKey, {
          resource_type: 'auto',
          flags: 'attachment'
        });
        console.log('Generated standard download URL');
      }
      
      console.log('Final download URL:', downloadUrl);
      
      // Fetch the file from Cloudinary
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file from Cloudinary: ${response.status} ${response.statusText}`);
      }
      
      const fileBuffer = await response.arrayBuffer();
      const base64File = Buffer.from(fileBuffer).toString('base64');
      
      // Ensure filename has extension
      const fileExtension = filename.includes('.') ? '' : '.jpg';
      
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}${fileExtension}"`,
        },
        body: base64File,
        isBase64Encoded: true,
      };
    }

  } catch (error) {
    console.error('Error in enhanced admin-download-file function:', error);
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
