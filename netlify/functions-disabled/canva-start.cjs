/**
 * Canva Start Function
 * 
 * Initiates a Canva design session by redirecting the user to the Canva app
 * with the appropriate parameters (orderId, width, height).
 * 
 * Environment Variables Required:
 * - CANVA_PREVIEW_BASE: Base URL for the Canva app preview link
 */

exports.handler = async (event, context) => {
  console.log('🎨 Canva Start - Initiating design session');
  
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const { orderId, width, height } = params;

    // Validate required parameters
    if (!orderId || !width || !height) {
      console.error('❌ Missing required parameters:', { orderId, width, height });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing required parameters',
          required: ['orderId', 'width', 'height']
        })
      };
    }

    // Validate environment variable
    const canvaPreviewBase = process.env.CANVA_PREVIEW_BASE;
    if (!canvaPreviewBase) {
      console.error('❌ CANVA_PREVIEW_BASE environment variable not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Canva integration not configured' })
      };
    }

    // Build the Canva app URL with query parameters
    // The state parameter will be used to identify the order when Canva publishes back
    const canvaUrl = new URL(canvaPreviewBase);
    canvaUrl.searchParams.set('state', orderId);
    canvaUrl.searchParams.set('width', width);
    canvaUrl.searchParams.set('height', height);

    const finalUrl = canvaUrl.toString();
    console.log('✅ Redirecting to Canva:', { orderId, width, height, url: finalUrl });

    // Redirect the user to Canva
    return {
      statusCode: 302,
      headers: {
        'Location': finalUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: ''
    };

  } catch (error) {
    console.error('❌ Error in canva-start:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
