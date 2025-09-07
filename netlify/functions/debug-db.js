const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (!process.env.NETLIFY_DATABASE_URL) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'MISSING_DATABASE_URL' })
      };
    }

    const [{ count }] = await sql`SELECT COUNT(*)::int FROM orders`;
    const latest = await sql`
      SELECT id, user_id, email, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const users = await sql`
      SELECT id, email, username
      FROM profiles
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const dbHost = new URL(process.env.NETLIFY_DATABASE_URL).host.slice(-24);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        dbHostSuffix: dbHost,
        orderCount: count,
        latestOrders: latest,
        recentUsers: users
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
