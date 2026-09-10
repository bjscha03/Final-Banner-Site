const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dqiwqlu0y',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async (event) => {
  console.log('[Test] Starting Cloudinary fetch test');
  
  try {
    const { fileKey } = JSON.parse(event.body || '{}');
    
    if (!fileKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing fileKey parameter' })
      };
    }
    
    console.log('[Test] File key:', fileKey);
    
    // Generate URL using Cloudinary SDK
    const cloudinaryUrl = cloudinary.url(fileKey, {
      resource_type: 'image',
      secure: true
    });
    
    console.log('[Test] Generated URL:', cloudinaryUrl);
    
    // Try to fetch
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(cloudinaryUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      const fetchTime = Date.now() - startTime;
      console.log(`[Test] Fetch completed in ${fetchTime}ms, status: ${response.status}`);
      
      if (!response.ok) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: false,
            fileKey,
            cloudinaryUrl,
            fetchStatus: response.status,
            fetchTime,
            error: `HTTP ${response.status} ${response.statusText}`
          })
        };
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const byteLength = arrayBuffer.byteLength;
      
      console.log(`[Test] Image downloaded: ${byteLength} bytes`);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          fileKey,
          cloudinaryUrl,
          fetchStatus: response.status,
          fetchTime,
          byteLength
        })
      };
      
    } catch (fetchError) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError') {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: false,
            fileKey,
            cloudinaryUrl,
            error: 'Fetch timed out after 5 seconds'
          })
        };
      }
      
      throw fetchError;
    }
    
  } catch (error) {
    console.error('[Test] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  }
};
