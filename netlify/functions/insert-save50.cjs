const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);

    // Check if SAVE50 already exists
    const existing = await sql`SELECT id, code FROM discount_codes WHERE code = 'SAVE50' LIMIT 1`;
    if (existing.length > 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'SAVE50 already exists', existing: existing[0] }) };
    }

    // Insert SAVE50: 50% off, single-use, expires end of 2026
    const result = await sql`
      INSERT INTO discount_codes (code, discount_percentage, single_use, used, expires_at, created_at, updated_at)
      VALUES ('SAVE50', 50, TRUE, FALSE, '2026-12-31T23:59:59Z', NOW(), NOW())
      RETURNING id, code, discount_percentage, single_use, expires_at
    `;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, inserted: result[0] }) };
  } catch (error) {
    console.error('[insert-save50] Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
