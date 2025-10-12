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

    console.log('[AI-Credits-Status] Processing request for userId:', userId);

    // Ensure user exists
    await sql`INSERT INTO users (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`;
    await sql`INSERT INTO user_credits (user_id, credits) VALUES (${userId}, 0) ON CONFLICT (user_id) DO NOTHING`;

    // Get current paid credits balance from user_credits table (this is the source of truth)
    const creditsBalanceResult = await sql`
      SELECT credits
      FROM user_credits
      WHERE user_id = ${userId}
    `;
    const paidCreditsRemaining = parseInt(creditsBalanceResult[0]?.credits || '0', 10);
    console.log('[AI-Credits-Status] Paid credits balance from user_credits:', paidCreditsRemaining);

    // Get total credits purchased (for display purposes only)
    const purchasesResult = await sql`
      SELECT COALESCE(SUM(credits_purchased), 0) as total_purchased
      FROM credit_purchases
      WHERE user_id = ${userId} AND status = 'completed'
    `;
    const totalPurchased = parseInt(purchasesResult[0]?.total_purchased || '0', 10);
    console.log('[AI-Credits-Status] Total purchased from credit_purchases:', totalPurchased);

    // Get total paid credits used (count of generations that used paid credits)
    const paidUsageResult = await sql`
      SELECT COUNT(*) as count
      FROM usage_log
      WHERE user_id = ${userId}
        AND event = 'GEN_SUCCESS'
        AND (meta->>'used_free')::boolean = false
    `;
    const paidCreditsUsed = parseInt(paidUsageResult[0]?.count || '0', 10);
    console.log('[AI-Credits-Status] Paid credits used from usage_log:', paidCreditsUsed);

    // Get free credits used (count of generations that used free credits)
    const freeUsedResult = await sql`
      SELECT COUNT(*) as count
      FROM usage_log
      WHERE user_id = ${userId}
        AND event = 'GEN_SUCCESS'
        AND (meta->>'used_free')::boolean = true
    `;
    const freeCreditsUsed = parseInt(freeUsedResult[0]?.count || '0', 10);
    console.log('[AI-Credits-Status] Free credits used from usage_log:', freeCreditsUsed);

    // Calculate free credits remaining
    const freeCreditsRemaining = Math.max(0, FREE_CREDITS_INITIAL - freeCreditsUsed);
    console.log('[AI-Credits-Status] Free credits remaining:', freeCreditsRemaining);

    // Total credits remaining = free + paid balance
    const totalCreditsRemaining = freeCreditsRemaining + paidCreditsRemaining;
    console.log('[AI-Credits-Status] Total credits remaining:', totalCreditsRemaining);

    const response = {
      // New simplified credit system
      freeCreditsTotal: FREE_CREDITS_INITIAL,
      freeCreditsUsed: freeCreditsUsed,
      freeCreditsRemaining: freeCreditsRemaining,
      paidCreditsPurchased: totalPurchased,
      paidCreditsUsed: paidCreditsUsed,
      paidCreditsRemaining: paidCreditsRemaining,
      totalCreditsRemaining: totalCreditsRemaining,
      
      // Legacy fields for backward compatibility
      freeRemainingToday: freeCreditsRemaining,
      paidCredits: paidCreditsRemaining,
    };

    console.log('[AI-Credits-Status] Response:', JSON.stringify(response, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
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
