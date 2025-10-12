import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');
const FREE_IMGS_PER_DAY = parseInt(process.env.FREE_IMGS_PER_DAY || '3', 10);
const MONTHLY_SOFT_CAP = parseFloat(process.env.IMG_MONTHLY_SOFT_CAP_USD || '100');

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    const userId = event.queryStringParameters?.userId;
    if (!userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing userId' }) };
    }

    // Ensure user exists
    await sql`INSERT INTO users (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`;
    await sql`INSERT INTO user_credits (user_id, credits) VALUES (${userId}, 0) ON CONFLICT (user_id) DO NOTHING`;

    // Get free remaining
    const freeResult = await sql`
      SELECT COUNT(*) as count FROM usage_log
      WHERE user_id = ${userId} AND event = 'GEN_SUCCESS'
      AND created_at >= CURRENT_DATE AND (meta->>'used_free')::boolean = true
    `;
    const usedToday = parseInt(freeResult[0]?.count || '0', 10);
    const freeRemainingToday = Math.max(0, FREE_IMGS_PER_DAY - usedToday);

    // Get paid credits
    const creditsResult = await sql`SELECT credits FROM user_credits WHERE user_id = ${userId}`;
    const paidCredits = creditsResult[0]?.credits || 0;

    // Get monthly spend
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const spendResult = await sql`
      SELECT COALESCE(SUM((meta->>'cost')::numeric), 0) as total FROM usage_log
      WHERE user_id = ${userId} AND event = 'GEN_SUCCESS' AND created_at >= ${startOfMonth.toISOString()}
    `;
    const monthlySpend = parseFloat(spendResult[0]?.total || '0');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        freeRemainingToday,
        paidCredits,
        monthlySpend,
        monthlyCap: MONTHLY_SOFT_CAP,
      }),
    };
  } catch (error) {
    console.error('[AI-Credits-Status] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
};
