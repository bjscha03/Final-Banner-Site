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
    const slug = event.path.split('/').pop();
    if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Slug required' }) };

    const eventResult = await sql`
      SELECT e.*, c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM events e
      LEFT JOIN event_categories c ON e.category_id = c.id
      WHERE e.slug = ${slug} AND e.status = 'approved'
      LIMIT 1
    `;

    if (eventResult.length === 0) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Event not found' }) };

    const eventData = eventResult[0];
    const relatedEvents = await sql`
      SELECT e.id, e.title, e.slug, e.summary_short, e.image_url, e.city, e.state, e.start_at,
             c.name as category_name, c.slug as category_slug
      FROM events e
      LEFT JOIN event_categories c ON e.category_id = c.id
      WHERE e.category_id = ${eventData.category_id}
      AND e.slug != ${slug}
      AND e.status = 'approved'
      AND e.start_at >= NOW()
      ORDER BY e.start_at ASC
      LIMIT 4
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ event: eventData, related_events: relatedEvents })
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
