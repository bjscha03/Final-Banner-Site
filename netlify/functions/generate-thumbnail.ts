import { Handler } from '@netlify/functions';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { objects, backgroundColor, width, height } = JSON.parse(event.body || '{}');

    console.log('[THUMBNAIL API] Generating server-side thumbnail', { 
      objectCount: objects?.length, 
      backgroundColor, 
      width, 
      height 
    });

    // For now, if there's an image object, use the first Cloudinary image as thumbnail
    const imageObject = objects?.find((obj: any) => obj.type === 'image' && obj.url);
    
    if (imageObject) {
      // Use Cloudinary transformation to create a thumbnail
      const cloudinaryUrl = imageObject.url;
      
      // Transform the Cloudinary URL to create a thumbnail
      // Example: https://res.cloudinary.com/xxx/image/upload/v123/abc.jpg
      // Becomes: https://res.cloudinary.com/xxx/image/upload/w_400,h_300,c_fill/v123/abc.jpg
      
      const thumbnailUrl = cloudinaryUrl.replace(
        '/upload/',
        `/upload/w_${Math.round(width || 400)},h_${Math.round(height || 300)},c_fill,q_auto,f_auto/`
      );
      
      console.log('[THUMBNAIL API] Using Cloudinary image as thumbnail:', thumbnailUrl);
      
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          thumbnailUrl,
          method: 'cloudinary-transform'
        }),
      };
    }

    // If no image, return a simple colored rectangle data URL
    console.log('[THUMBNAIL API] No images found, creating solid color thumbnail');
    
    // Create a simple SVG as fallback
    const svg = `<svg width="${width || 400}" height="${height || 300}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${backgroundColor || '#ffffff'}"/>
      <text x="50%" y="50%" text-anchor="middle" fill="#666" font-family="Arial" font-size="20">
        Banner Preview
      </text>
    </svg>`;
    
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        thumbnailUrl: dataUrl,
        method: 'svg-fallback'
      }),
    };

  } catch (error: any) {
    console.error('[THUMBNAIL API] Error:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
    };
  }
};
