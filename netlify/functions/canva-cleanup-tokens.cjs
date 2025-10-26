/**
 * Canva Token Cleanup Job
 * 
 * Automatically deletes Canva tokens that have been disconnected for more than 30 days.
 */

const { neon } = require('@neondatabase/serverless');

const getDb = () => {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Database URL not configured');
  return neon(dbUrl);
};

exports.handler = async (event, context) => {
  console.log('🧹 Canva Token Cleanup - Starting cleanup job');

  try {
    const db = getDb();

    const result = await db`
      DELETE FROM canva_tokens
      WHERE disconnected_at IS NOT NULL
      AND disconnected_at < NOW() - INTERVAL '30 days'
      RETURNING id, user_id, disconnected_at
    `;

    const deletedCount = result.length;
    console.log(`✅ Cleanup complete: ${deletedCount} tokens deleted`);

    const activeTokens = await db`
      SELECT COUNT(*) as count
      FROM canva_tokens
      WHERE disconnected_at IS NULL
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        deletedCount: deletedCount,
        activeTokens: parseInt(activeTokens[0].count),
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error in cleanup job:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Cleanup job failed', message: error.message })
    };
  }
};
