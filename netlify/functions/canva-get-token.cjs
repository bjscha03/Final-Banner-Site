/**
 * Get Canva Token Function
 * 
 * Retrieves the active Canva token for a user from the database.
 * Returns the token if valid, or indicates if refresh is needed.
 * 
 * This is used by canva-export and other functions that need to make
 * Canva API calls on behalf of the user.
 */

const { neon } = require('@neondatabase/serverless');

// Database connection
const getDb = () => {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Database URL not configured');
  }
  return neon(dbUrl);
};

exports.handler = async (event, context) => {
  console.log('🔑 Get Canva Token - Retrieving token from database');

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { userId } = JSON.parse(event.body);

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId' })
      };
    }

    const db = getDb();

    // Get active token for user
    const tokens = await db`
      SELECT 
        access_token,
        refresh_token,
        expires_at,
        expires_at < NOW() as is_expired,
        disconnected_at IS NOT NULL as is_disconnected
      FROM canva_tokens
      WHERE user_id = ${userId}
      AND disconnected_at IS NULL
      LIMIT 1
    `;

    if (tokens.length === 0) {
      console.log('❌ No token found for user:', userId);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'No Canva token found',
          message: 'User has not connected their Canva account'
        })
      };
    }

    const token = tokens[0];

    if (token.is_disconnected) {
      console.log('❌ Token has been disconnected for user:', userId);
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Token disconnected',
          message: 'User has disconnected their Canva account'
        })
      };
    }

    // Update last_used_at
    await db`
      UPDATE canva_tokens
      SET last_used_at = NOW()
      WHERE user_id = ${userId}
    `;

    console.log('✅ Token retrieved successfully');
    console.log('⏰ Token expires at:', token.expires_at);
    console.log('🔄 Token is expired:', token.is_expired);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        isExpired: token.is_expired,
        needsRefresh: token.is_expired
      })
    };

  } catch (error) {
    console.error('❌ Error retrieving Canva token:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
