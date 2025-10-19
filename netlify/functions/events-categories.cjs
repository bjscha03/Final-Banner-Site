/**
 * GET /api/events/categories
 * Returns all event categories with event counts
 */

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000'
  };

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
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const sql = neon(DATABASE_URL);

    const categories = await sql`
      SELECT 
        c.id,
        c.name,
        c.slug,
        c.description,
        COUNT(e.id) FILTER (WHERE e.status = 'approved') as event_count
      FROM event_categories c
      LEFT JOIN events e ON e.category_id = c.id
      GROUP BY c.id, c.name, c.slug, c.description
      ORDER BY c.name ASC
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        categories: categories.map(cat => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          event_count: parseInt(cat.event_count) || 0
        }))
      })
    };

  } catch (error) {
    console.error('Error fetching categories:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch categories',
        message: error.message
      })
    };
  }
};
