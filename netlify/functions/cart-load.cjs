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
      if (!uuidRegex.test(userId)) {
        console.log('[cart-load] Invalid UUID format for userId, returning empty cart');
        return { statusCode: 200, headers, body: JSON.stringify({ cartData: [] }) };
      }
      console.log('[cart-load] Querying database for user_id:', userId);
      result = await sql`
        SELECT cart_data, updated_at, user_id
        FROM user_carts
        WHERE user_id = ${userId} AND status = 'active'
        LIMIT 1
      `;
      console.log('[cart-load] Query result:', { found: result.length > 0, itemCount: result.length > 0 ? result[0].cart_data.length : 0 });
    } else if (sessionId) {
      result = await sql`
        SELECT cart_data, updated_at
        FROM user_carts
        WHERE session_id = ${sessionId} AND status = 'active'
        LIMIT 1
      `;
    }

    const rawCartData = result && result.length > 0 ? result[0].cart_data : [];

    // CRITICAL FIX: Reconstruct image URLs from file_key when thumbnail_url is missing or invalid
    const CLOUDINARY_BASE = 'https://res.cloudinary.com/dtrxl120u/image/upload';
    
    // Helper: Check if URL is a valid, permanent Cloudinary URL
    const isValidCloudinaryUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      if (url.trim() === '') return false;
      if (url.startsWith('blob:')) return false;
      if (url.startsWith('data:')) return false;
      if (!url.startsWith('https://res.cloudinary.com/')) return false;
      return true;
    };

    // NEW FALLBACK: Extract file_key (public ID) from Cloudinary URL
    // URL format: https://res.cloudinary.com/{cloud}/image/upload/{transforms}/{public_id}.{ext}
    const extractFileKeyFromUrl = (url) => {
      if (!isValidCloudinaryUrl(url)) return null;
      try {
        // Remove query string if present
        const urlWithoutQuery = url.split('?')[0];
        // Get the last path segment (filename with extension)
        const pathParts = urlWithoutQuery.split('/');
        const filename = pathParts[pathParts.length - 1];
        // Remove extension to get public ID
        const lastDot = filename.lastIndexOf('.');
        if (lastDot > 0) {
          return filename.substring(0, lastDot);
        }
        // No extension found, return whole filename
        return filename;
      } catch (e) {
        console.log('[cart-load] Failed to extract file_key from URL:', url);
        return null;
      }
    };
    
    const cartData = rawCartData.map((item, index) => {
      console.log('[cart-load] Item', index + 1, 'raw data:', {
        id: item.id,
        file_key: item.file_key || 'NULL',
        is_pdf: item.is_pdf,
        file_url: item.file_url ? item.file_url.substring(0, 80) : 'NULL',
        thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL'
      });
      
      const enhanced = { ...item };
      
      // Try to get file_key from stored value or extract from URLs
      let fileKey = item.file_key;
      
      // FALLBACK: If file_key is missing, try to extract from file_url or thumbnail_url
      if (!fileKey) {
        // Try file_url first
        if (isValidCloudinaryUrl(item.file_url)) {
          fileKey = extractFileKeyFromUrl(item.file_url);
          if (fileKey) {
            console.log('[cart-load] Extracted file_key from file_url:', fileKey);
            enhanced.file_key = fileKey;
          }
        }
        // Try thumbnail_url if still missing
        if (!fileKey && isValidCloudinaryUrl(item.thumbnail_url)) {
          fileKey = extractFileKeyFromUrl(item.thumbnail_url);
          if (fileKey) {
            console.log('[cart-load] Extracted file_key from thumbnail_url:', fileKey);
            enhanced.file_key = fileKey;
          }
        }
      }
      
      // Now reconstruct URLs if we have a file_key
      if (fileKey) {
        // Reconstruct file_url if not a valid Cloudinary URL
        if (!isValidCloudinaryUrl(enhanced.file_url)) {
          enhanced.file_url = `${CLOUDINARY_BASE}/${fileKey}`;
          console.log('[cart-load] Reconstructed file_url:', enhanced.file_url);
        }
        
        // ALWAYS reconstruct thumbnail_url if not a valid Cloudinary URL
        if (!isValidCloudinaryUrl(enhanced.thumbnail_url)) {
          if (item.is_pdf) {
            enhanced.thumbnail_url = `${CLOUDINARY_BASE}/pg_1,f_jpg,w_400,h_400,c_fit,q_auto/${fileKey}`;
          } else {
            enhanced.thumbnail_url = `${CLOUDINARY_BASE}/w_400,h_400,c_fit,q_auto,f_auto/${fileKey}`;
          }
          console.log('[cart-load] Reconstructed thumbnail_url:', enhanced.thumbnail_url);
        }
      } else {
        console.log('[cart-load] WARNING: Item', index + 1, 'has no file_key and could not extract from URLs');
      }
      
      // Also check overlay_image for file_key reconstruction
      if (enhanced.overlay_image && enhanced.overlay_image.fileKey) {
        if (!isValidCloudinaryUrl(enhanced.overlay_image.url)) {
          enhanced.overlay_image = {
            ...enhanced.overlay_image,
            url: `${CLOUDINARY_BASE}/${enhanced.overlay_image.fileKey}`
          };
        }
      }
      
      // Check overlay_images array
      if (Array.isArray(enhanced.overlay_images)) {
        enhanced.overlay_images = enhanced.overlay_images.map(img => {
          if (img.fileKey && !isValidCloudinaryUrl(img.url)) {
            return { ...img, url: `${CLOUDINARY_BASE}/${img.fileKey}` };
          }
          return img;
        });
      }
      
      return enhanced;
    });

    console.log('[cart-load] Cart loaded:', { itemCount: cartData.length });
    
    // Log final results
    cartData.forEach((item, idx) => {
      console.log('[cart-load] FINAL Item', idx + 1, ':', {
        id: item.id,
        file_key: item.file_key || 'NULL',
        thumbnail_url: item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL'
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
