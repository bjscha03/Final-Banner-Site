const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('[get-abandoned-carts] No database URL found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration error' })
      };
    }

    const sql = neon(databaseUrl);

    const carts = await sql`
      SELECT 
        id,
        email,
        phone,
        cart_contents,
        total_value,
        recovery_status,
        recovery_emails_sent,
        discount_code,
        last_activity_at,
        abandoned_at,
        created_at
      FROM abandoned_carts
      WHERE recovery_status IN ('active', 'abandoned')
      ORDER BY abandoned_at DESC NULLS LAST, last_activity_at DESC
      LIMIT 100
    `;

    console.log(`[get-abandoned-carts] Found ${carts.length} abandoned carts`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ carts })
    };

  } catch (error) {
    console.error('[get-abandoned-carts] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch abandoned carts',
        message: error.message 
      })
    };
  }
};
