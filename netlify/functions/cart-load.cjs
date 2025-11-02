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

    const cartData = result && result.length > 0 ? result[0].cart_data : [];

    console.log('[cart-load] Cart loaded:', { itemCount: cartData.length });

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
