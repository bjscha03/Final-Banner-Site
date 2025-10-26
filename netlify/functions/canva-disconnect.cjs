/**
 * Canva Disconnect Function
 * 
 * Marks a user's Canva token as disconnected (soft delete).
 * The token will be automatically deleted after 30 days by the cleanup job.
 */

const { neon } = require('@neondatabase/serverless');

const getDb = () => {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Database URL not configured');
  return neon(dbUrl);
};

exports.handler = async (event, context) => {
  console.log('🔌 Canva Disconnect - Revoking user token');

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
    const result = await db`
      UPDATE canva_tokens
      SET disconnected_at = NOW()
      WHERE user_id = ${userId}
      AND disconnected_at IS NULL
      RETURNING id, user_id, disconnected_at
    `;

    if (result.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No active token found' })
      };
    }

    console.log('✅ Token marked as disconnected for user:', userId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Canva connection disconnected successfully',
        disconnectedAt: result[0].disconnected_at
      })
    };

  } catch (error) {
    console.error('❌ Error disconnecting Canva token:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};
