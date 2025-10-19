const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    const params = event.queryStringParameters || {};
    const status = params.status || 'approved';
    const category = params.category || null;
    const featured = params.featured === 'true' ? true : null;
    const limit = parseInt(params.limit) || 50;
    const offset = parseInt(params.offset) || 0;

    let query = `
      SELECT 
        e.id, e.title, e.slug, e.summary_short, e.image_url,
        e.venue, e.city, e.state, e.start_at, e.end_at, e.is_featured,
        c.name as category_name, c.slug as category_slug
      FROM events e
      LEFT JOIN event_categories c ON e.category_id = c.id
      WHERE e.status = '${status}'
      AND e.start_at >= NOW() - INTERVAL '7 days'
    `;

    if (category) query += ` AND c.slug = '${category}'`;
    if (featured) query += ` AND e.is_featured = true`;

    query += ` ORDER BY e.is_featured DESC, e.start_at ASC LIMIT ${limit} OFFSET ${offset}`;

    const events = await sql.unsafe(query);
    const countResult = await sql.unsafe(query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM').split('ORDER BY')[0]);
    const total = parseInt(countResult[0]?.total) || 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        events,
        pagination: { total, limit, offset, has_more: offset + limit < total }
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
