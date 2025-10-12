import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');
const FREE_CREDITS_INITIAL = 3; // New users get 3 free credits total

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

    // Get total credits purchased (from credit_purchases table)
    const purchasesResult = await sql`
      SELECT COALESCE(SUM(credits_purchased), 0) as total_purchased
      FROM credit_purchases
      WHERE user_id = ${userId} AND status = 'completed'
    `;
    const totalPurchased = parseInt(purchasesResult[0]?.total_purchased || '0', 10);

    // Get total credits used (from usage_log where credits were debited)
    const usageResult = await sql`
      SELECT COUNT(*) as count
      FROM usage_log
      WHERE user_id = ${userId}
        AND event = 'GEN_SUCCESS'
        AND (meta->>'used_free')::boolean = false
    `;
    const creditsUsed = parseInt(usageResult[0]?.count || '0', 10);

    // Get free credits used
    const freeUsedResult = await sql`
      SELECT COUNT(*) as count
      FROM usage_log
      WHERE user_id = ${userId}
        AND event = 'GEN_SUCCESS'
        AND (meta->>'used_free')::boolean = true
    `;
    const freeCreditsUsed = parseInt(freeUsedResult[0]?.count || '0', 10);

    // Calculate remaining
    const freeCreditsRemaining = Math.max(0, FREE_CREDITS_INITIAL - freeCreditsUsed);
    const paidCreditsRemaining = Math.max(0, totalPurchased - creditsUsed);
    const totalCreditsRemaining = freeCreditsRemaining + paidCreditsRemaining;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        // New simplified credit system
        freeCreditsTotal: FREE_CREDITS_INITIAL,
        freeCreditsUsed: freeCreditsUsed,
        freeCreditsRemaining: freeCreditsRemaining,
        paidCreditsPurchased: totalPurchased,
        paidCreditsUsed: creditsUsed,
        paidCreditsRemaining: paidCreditsRemaining,
        totalCreditsRemaining: totalCreditsRemaining,
        
        // Legacy fields for backward compatibility (will be removed later)
        freeRemainingToday: freeCreditsRemaining,
        paidCredits: paidCreditsRemaining,
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
