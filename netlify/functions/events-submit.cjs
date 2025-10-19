const { neon } = require('@neondatabase/serverless');
const { generateSlug, transformToCloudinaryFetch, generateAutoSummary } = require('./utils/eventHelpers.cjs');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    const body = JSON.parse(event.body);
    
    const required = ['title', 'category_slug', 'city', 'state', 'start_at', 'submitter_email'];
    const missing = required.filter(field => !body[field]);
    if (missing.length > 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields', missing_fields: missing }) };
    }

    const categoryResult = await sql`SELECT id, name, slug FROM event_categories WHERE slug = ${body.category_slug} LIMIT 1`;
    if (categoryResult.length === 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid category' }) };

    const category = categoryResult[0];
    let slug = generateSlug(body.title);
    let slugSuffix = 1;
    
    while (true) {
      const existing = await sql`SELECT id FROM events WHERE slug = ${slug} LIMIT 1`;
      if (existing.length === 0) break;
      slug = `${generateSlug(body.title)}-${slugSuffix}`;
      slugSuffix++;
    }

    const imageUrl = body.image_url ? transformToCloudinaryFetch(body.image_url) : null;
    let summaryShort = body.description || '';
    
    if (!summaryShort) {
      summaryShort = generateAutoSummary({
        title: body.title,
        category_name: category.name,
        city: body.city,
        state: body.state,
        start_at: body.start_at,
        venue: body.venue || null
      });
    }

    const clientIp = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || 'unknown';

    const result = await sql`
      INSERT INTO events (
        title, slug, category_id, summary_short, description, external_url, image_url,
        venue, city, state, start_at, end_at, status, created_by, created_ip
      ) VALUES (
        ${body.title}, ${slug}, ${category.id}, ${summaryShort.substring(0, 500)},
        ${body.description || null}, ${body.external_url || null}, ${imageUrl},
        ${body.venue || null}, ${body.city}, ${body.state.toUpperCase()},
        ${body.start_at}, ${body.end_at || null}, 'pending', ${body.submitter_email}, ${clientIp}
      )
      RETURNING id, slug, status
    `;

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        event: result[0],
        message: 'Event submitted successfully and is pending approval'
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
