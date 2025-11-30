const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    
    // Validate UUID format for userId (PostgreSQL UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { userId, sessionId, cartData } = JSON.parse(event.body || '{}');

    if (!userId && !sessionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Either userId or sessionId required' }) };
    }

    if (!cartData || !Array.isArray(cartData)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'cartData must be an array' }) };
    }

    console.log('[cart-save] Saving cart:', { userId: userId ? `${userId.substring(0, 8)}...` : null, sessionId: sessionId ? `${sessionId.substring(0, 12)}...` : null, itemCount: cartData.length });
    
    // DEBUG: Log what fields are in the cart items being saved
    if (cartData.length > 0) {
      console.log('[cart-save] First item keys:', Object.keys(cartData[0]));
      console.log('[cart-save] First item file_url:', cartData[0].file_url);
      console.log('[cart-save] First item is_pdf:', cartData[0].is_pdf);
      console.log('[cart-save] First item file_key:', cartData[0].file_key);
      console.log('[cart-save] First item overlay_image:', cartData[0].overlay_image);
      console.log('[cart-save] First item text_elements:', cartData[0].text_elements);
    }

    // CRITICAL: Clean cart data - remove blob/data URLs that can cause DB errors (too large)
    const cleanedCartData = cartData.map(item => {
      const cleaned = { ...item };
      
      // Helper function to check if a string is a problematic URL
      const isBadUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        return url.startsWith('blob:') || url.startsWith('data:') || url.length > 10000;
      };
      
      // Remove blob/data URLs from file_url (they don't persist anyway and are HUGE)
      if (isBadUrl(cleaned.file_url)) {
        console.log('[cart-save] Removing invalid file_url (blob/data URL or too large)');
        cleaned.file_url = null;
      }
      // Remove blob/data URLs from thumbnail_url  
      if (isBadUrl(cleaned.thumbnail_url)) {
        console.log('[cart-save] Removing invalid thumbnail_url (blob/data URL or too large)');
        cleaned.thumbnail_url = null;
      }
      // Remove blob/data URLs from web_preview_url
      if (isBadUrl(cleaned.web_preview_url)) {
        console.log('[cart-save] Removing invalid web_preview_url (blob/data URL or too large)');
        cleaned.web_preview_url = null;
      }
      // Remove blob/data URLs from print_ready_url
      if (isBadUrl(cleaned.print_ready_url)) {
        console.log('[cart-save] Removing invalid print_ready_url (blob/data URL or too large)');
        cleaned.print_ready_url = null;
      }
      // Remove blob/data URLs from overlay_image.url
      if (cleaned.overlay_image?.url && isBadUrl(cleaned.overlay_image.url)) {
        console.log('[cart-save] Removing invalid overlay_image.url (blob/data URL or too large)');
        cleaned.overlay_image = { ...cleaned.overlay_image, url: null };
      }
      // Remove blob/data URLs from overlay_images array
      if (Array.isArray(cleaned.overlay_images)) {
        cleaned.overlay_images = cleaned.overlay_images.map(img => {
          if (img?.url && isBadUrl(img.url)) {
            console.log('[cart-save] Removing invalid overlay_images[].url');
            return { ...img, url: null };
          }
          return img;
        });
      }
      // Remove any canvas_snapshot data (should never be saved)
      if (cleaned.canvas_snapshot) {
        console.log('[cart-save] Removing canvas_snapshot');
        delete cleaned.canvas_snapshot;
      }
      return cleaned;
    });
    
    console.log('[cart-save] Cleaned cart data for', cleanedCartData.length, 'items');

    // Validate userId is a valid UUID before attempting database operations
    if (userId && !uuidRegex.test(userId)) {
      console.log('[cart-save] Invalid UUID format for userId, skipping save');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Cart save skipped for invalid userId' })
      };
    }

    const cartDataJson = JSON.stringify(cleanedCartData);
    console.log('[cart-save] Cart JSON size:', Math.round(cartDataJson.length / 1024), 'KB');

    if (userId) {
      // BULLETPROOF: Delete ALL active carts for this user first, then insert new one
      console.log('[cart-save] Deleting all active carts for user:', userId);
      await sql`
        DELETE FROM user_carts
        WHERE user_id = ${userId} AND status = 'active'
      `;
      
      console.log('[cart-save] Inserting new cart for user:', userId);
      await sql`
        INSERT INTO user_carts (user_id, cart_data, status, updated_at, last_accessed_at)
        VALUES (${userId}, ${cartDataJson}::jsonb, 'active', NOW(), NOW())
      `;
      
      console.log('[cart-save] Cart saved successfully for user:', userId);
    } else if (sessionId) {
      // BULLETPROOF: Delete ALL active carts for this session first, then insert new one
      console.log('[cart-save] Deleting all active carts for session:', sessionId);
      await sql`
        DELETE FROM user_carts
        WHERE session_id = ${sessionId} AND status = 'active'
      `;
      
      console.log('[cart-save] Inserting new cart for session:', sessionId);
      await sql`
        INSERT INTO user_carts (session_id, cart_data, status, updated_at, last_accessed_at)
        VALUES (${sessionId}, ${cartDataJson}::jsonb, 'active', NOW(), NOW())
      `;
      
      console.log('[cart-save] Cart saved successfully for session:', sessionId);
    }

    console.log('[cart-save] Cart saved successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('[cart-save] Error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
