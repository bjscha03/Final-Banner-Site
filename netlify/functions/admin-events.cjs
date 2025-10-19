const { neon } = require('@neondatabase/serverless');

function checkAdminAuth(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  return token.length > 0;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!checkAdminAuth(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const status = params.status || 'pending';
      const search = params.search || null;
      const limit = parseInt(params.limit) || 100;
      const offset = parseInt(params.offset) || 0;

      let query = `
        SELECT e.*, c.name as category_name, c.slug as category_slug
        FROM events e
        LEFT JOIN event_categories c ON e.category_id = c.id
        WHERE e.status = '${status}'
      `;
      
      if (search) query += ` AND (e.title ILIKE '%${search}%' OR e.city ILIKE '%${search}%')`;
      query += ` ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const events = await sql.unsafe(query);
      return { statusCode: 200, headers, body: JSON.stringify({ events }) };
    }

    if (event.httpMethod === 'PATCH') {
      const eventId = event.path.split('/').pop();
      const body = JSON.parse(event.body);
      if (!eventId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Event ID required' }) };

      const updates = [];
      if (body.status && ['pending', 'approved', 'rejected'].includes(body.status)) {
        updates.push(`status = '${body.status}'`);
      }
      if (typeof body.is_featured === 'boolean') {
        updates.push(`is_featured = ${body.is_featured}`);
      }

      if (updates.length === 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid fields to update' }) };

      const result = await sql.unsafe(`UPDATE events SET ${updates.join(', ')} WHERE id = '${eventId}' RETURNING id, slug, status, is_featured`);
      if (result.length === 0) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Event not found' }) };

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, event: result[0] }) };
    }

    if (event.httpMethod === 'DELETE') {
      const eventId = event.path.split('/').pop();
      if (!eventId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Event ID required' }) };

      const result = await sql`DELETE FROM events WHERE id = ${eventId} RETURNING id`;
      if (result.length === 0) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Event not found' }) };

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Event deleted' }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
