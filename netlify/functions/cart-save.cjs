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

    // Validate userId is a valid UUID before attempting database operations
    if (userId && !uuidRegex.test(userId)) {
      console.log('[cart-save] Invalid UUID format for userId, skipping save');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Cart save skipped for invalid userId' })
      };
    }

    const cartDataJson = JSON.stringify(cartData);

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
