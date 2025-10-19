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

    console.log('[events-list] Query params:', { status, category, featured, limit, offset });

    // Calculate cutoff date (7 days ago) in JavaScript
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString();

    console.log('[events-list] Cutoff date:', cutoffDate);

    // Build query based on filters
    let events, countResult;
    
    try {
      if (category && featured) {
        console.log('[events-list] Query: category + featured');
        events = await sql`
          SELECT 
            e.id, e.title, e.slug, e.summary_short, e.image_url,
            e.venue, e.city, e.state, e.start_at, e.end_at, e.is_featured,
            c.name as category_name, c.slug as category_slug
          FROM events e
          LEFT JOIN event_categories c ON e.category_id = c.id
          WHERE e.status = ${status}
          AND c.slug = ${category}
          AND e.is_featured = true
          AND e.start_at >= ${cutoffDate}
          ORDER BY e.is_featured DESC, e.start_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countResult = await sql`
          SELECT COUNT(*) as total
          FROM events e
          LEFT JOIN event_categories c ON e.category_id = c.id
          WHERE e.status = ${status}
          AND c.slug = ${category}
          AND e.is_featured = true
          AND e.start_at >= ${cutoffDate}
        `;
      } else if (category) {
        console.log('[events-list] Query: category only');
        events = await sql`
          SELECT 
            e.id, e.title, e.slug, e.summary_short, e.image_url,
            e.venue, e.city, e.state, e.start_at, e.end_at, e.is_featured,
            c.name as category_name, c.slug as category_slug
          FROM events e
          LEFT JOIN event_categories c ON e.category_id = c.id
          WHERE e.status = ${status}
          AND c.slug = ${category}
          AND e.start_at >= ${cutoffDate}
          ORDER BY e.is_featured DESC, e.start_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countResult = await sql`
          SELECT COUNT(*) as total
          FROM events e
          LEFT JOIN event_categories c ON e.category_id = c.id
          WHERE e.status = ${status}
          AND c.slug = ${category}
          AND e.start_at >= ${cutoffDate}
        `;
      } else if (featured) {
        console.log('[events-list] Query: featured only');
        events = await sql`
          SELECT 
            e.id, e.title, e.slug, e.summary_short, e.image_url,
            e.venue, e.city, e.state, e.start_at, e.end_at, e.is_featured,
            c.name as category_name, c.slug as category_slug
          FROM events e
          LEFT JOIN event_categories c ON e.category_id = c.id
          WHERE e.status = ${status}
          AND e.is_featured = true
          AND e.start_at >= ${cutoffDate}
          ORDER BY e.is_featured DESC, e.start_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countResult = await sql`
          SELECT COUNT(*) as total
          FROM events e
          WHERE e.status = ${status}
          AND e.is_featured = true
          AND e.start_at >= ${cutoffDate}
        `;
      } else {
        console.log('[events-list] Query: no filters (status only)');
        events = await sql`
          SELECT 
            e.id, e.title, e.slug, e.summary_short, e.image_url,
            e.venue, e.city, e.state, e.start_at, e.end_at, e.is_featured,
            c.name as category_name, c.slug as category_slug
          FROM events e
          LEFT JOIN event_categories c ON e.category_id = c.id
          WHERE e.status = ${status}
          AND e.start_at >= ${cutoffDate}
          ORDER BY e.is_featured DESC, e.start_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
        countResult = await sql`
          SELECT COUNT(*) as total
          FROM events e
          WHERE e.status = ${status}
          AND e.start_at >= ${cutoffDate}
        `;
      }

      console.log('[events-list] Query successful, found', events.length, 'events');
    } catch (queryError) {
      console.error('[events-list] Query error:', queryError);
      throw queryError;
    }

    const total = parseInt(countResult[0]?.total) || 0;

    console.log('[events-list] Returning', events.length, 'events, total:', total);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        events,
        pagination: { total, limit, offset, has_more: offset + limit < total }
      })
    };
  } catch (error) {
    console.error('[events-list] Error:', error);
    console.error('[events-list] Error stack:', error.stack);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }) 
    };
  }
};
