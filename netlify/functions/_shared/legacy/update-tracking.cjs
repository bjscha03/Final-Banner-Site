const { neon } = require('@neondatabase/serverless');
const { validateTrackingEntries } = require('./tracking-helpers.cjs');
const { requireAdmin } = require('../server-auth.cjs');

// Neon database connection
// Lazily resolve DB URL so the function doesn't crash when missing
function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}


const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      console.error('Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Database configuration missing',
          details: 'Set NETLIFY_DATABASE_URL or VITE_DATABASE_URL or DATABASE_URL'
        })
      };
    }

    const sql = neon(dbUrl);

    const { id, carrier, number, trackingNumbers, isUpdate = false } = JSON.parse(event.body || '{}');

    if (!id || typeof id !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }



    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_numbers JSONB`;

    let normalized;
    try {
      normalized = validateTrackingEntries(Array.isArray(trackingNumbers) ? trackingNumbers : [{ carrier: carrier || 'fedex', trackingNumber: number }]);
    } catch (validationError) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: validationError.message }) };
    }

    const primaryTrackingNumber = normalized[0]?.trackingNumber || null;
    const trackingJson = JSON.stringify(normalized);
    // Keep legacy tracking_number populated with the first package for backward compatibility,
    // or clear it when the admin intentionally saves an empty tracking list.
    const result = !isUpdate && normalized.length > 0
      ? await sql`
          UPDATE orders
          SET tracking_number = ${primaryTrackingNumber},
              tracking_numbers = ${trackingJson}::jsonb,
              status = 'shipped',
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `
      : await sql`
          UPDATE orders
          SET tracking_number = ${primaryTrackingNumber},
              tracking_numbers = ${trackingJson}::jsonb,
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;

    if (result.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    console.log(`Tracking updated for order ${id}: ${normalized.map(t => t.trackingNumber).join(', ')} - ${new Date().toISOString()}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        order: result[0]
      })
    };

  } catch (error) {
    console.error('Update tracking failed:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};

