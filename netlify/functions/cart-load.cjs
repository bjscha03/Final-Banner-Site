const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    const params = event.queryStringParameters || {};
    const { userId, sessionId } = params;

    if (!userId && !sessionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Either userId or sessionId required' }) };
    }

    console.log('[cart-load] Loading cart:', { userId: userId ? `${userId.substring(0, 8)}...` : null, sessionId: sessionId ? `${sessionId.substring(0, 12)}...` : null });

    // Validate UUID format for userId (PostgreSQL UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    let result;

    if (userId) {
      // Check if userId is a valid UUID
      if (!uuidRegex.test(userId)) {
        console.log('[cart-load] Invalid UUID format for userId, returning empty cart');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ cartData: [] })
        };
      }
      
      // Load authenticated user's cart
      console.log('[cart-load] Querying database for user_id:', userId);
      result = await sql`
        SELECT cart_data, updated_at, user_id
        FROM user_carts
        WHERE user_id = ${userId} AND status = 'active'
        LIMIT 1
      `;
      console.log('[cart-load] Query result:', { 
        found: result.length > 0, 
        user_id: result.length > 0 ? result[0].user_id : null,
        itemCount: result.length > 0 ? result[0].cart_data.length : 0
      });
    } else if (sessionId) {
      // Load guest cart
      result = await sql`
        SELECT cart_data, updated_at
        FROM user_carts
        WHERE session_id = ${sessionId} AND status = 'active'
        LIMIT 1
      `;
    }

    const rawCartData = result && result.length > 0 ? result[0].cart_data : [];

    // CRITICAL FIX: Reconstruct image URLs from file_key when thumbnail_url and file_url are missing
    // This ensures thumbnails display correctly after logout/login
    const CLOUDINARY_BASE = 'https://res.cloudinary.com/dtrxl120u/image/upload';
    
    const cartData = rawCartData.map((item, index) => {
      console.log('[cart-load] Item', index + 1, 'raw data:', {
        id: item.id,
        file_key: item.file_key,
        file_url: item.file_url ? item.file_url.substring(0, 80) : null,
        thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : null,
        has_text_elements: !!item.text_elements && item.text_elements.length > 0,
        has_overlay_images: !!item.overlay_images && item.overlay_images.length > 0
      });
      const enhanced = { ...item };
      
      // If we have file_key but no displayable URLs, reconstruct them
      if (item.file_key) {
        // Reconstruct file_url if missing
        if (!enhanced.file_url || enhanced.file_url.startsWith('blob:') || enhanced.file_url.startsWith('data:')) {
          enhanced.file_url = `${CLOUDINARY_BASE}/${item.file_key}`;
          console.log('[cart-load] Reconstructed file_url from file_key:', enhanced.file_url);
        }
        
        // Reconstruct thumbnail_url if missing (use resized version for cart display)
        if (!enhanced.thumbnail_url || enhanced.thumbnail_url.startsWith('blob:') || enhanced.thumbnail_url.startsWith('data:')) {
          // Use Cloudinary transformations for optimized thumbnail
          enhanced.thumbnail_url = `${CLOUDINARY_BASE}/w_400,h_400,c_fit,q_auto,f_auto/${item.file_key}`;
          console.log('[cart-load] Reconstructed thumbnail_url from file_key:', enhanced.thumbnail_url);
        }
      }
      
      // Also check overlay_image for file_key reconstruction
      if (enhanced.overlay_image && enhanced.overlay_image.fileKey) {
        if (!enhanced.overlay_image.url || enhanced.overlay_image.url.startsWith('blob:') || enhanced.overlay_image.url.startsWith('data:')) {
          enhanced.overlay_image = {
            ...enhanced.overlay_image,
            url: `${CLOUDINARY_BASE}/${enhanced.overlay_image.fileKey}`
          };
          console.log('[cart-load] Reconstructed overlay_image.url from fileKey');
        }
      }
      
      // Check overlay_images array
      if (Array.isArray(enhanced.overlay_images)) {
        enhanced.overlay_images = enhanced.overlay_images.map(img => {
          if (img.fileKey && (!img.url || img.url.startsWith('blob:') || img.url.startsWith('data:'))) {
            return {
              ...img,
              url: `${CLOUDINARY_BASE}/${img.fileKey}`
            };
          }
          return img;
        });
      }
      
      return enhanced;
    });

    console.log('[cart-load] Cart loaded:', { itemCount: cartData.length });
    
    // Log thumbnail reconstruction results
    cartData.forEach((item, idx) => {
      console.log(`[cart-load] Item ${idx} URLs:`, {
        file_key: item.file_key,
        file_url: item.file_url ? item.file_url.substring(0, 60) : 'NULL',
        thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 60) : 'NULL'
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ cartData })
    };
  } catch (error) {
    console.error('[cart-load] Error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
