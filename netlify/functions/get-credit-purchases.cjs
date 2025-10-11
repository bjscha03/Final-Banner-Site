/**
 * Get Credit Purchases
 * 
 * Fetches credit purchase history for a user
 */

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    const userId = event.queryStringParameters?.user_id;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'MISSING_USER_ID' }),
      };
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'DATABASE_NOT_CONFIGURED' }),
      };
    }

    const sql = neon(dbUrl);

    const purchases = await sql`
      SELECT * FROM credit_purchases
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    console.log(`Found ${purchases.length} credit purchases for user ${userId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(purchases),
    };
  } catch (error) {
    console.error('Error fetching credit purchases:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      }),
    };
  }
};
