const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    // Check if database URL is available
    if (!process.env.NETLIFY_DATABASE_URL) {
      console.error('NETLIFY_DATABASE_URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Database configuration missing',
          details: 'NETLIFY_DATABASE_URL environment variable not set'
        })
      };
    }



    const { id, carrier, number } = JSON.parse(event.body || '{}');

    if (!id || typeof id !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }

    if (!number || typeof number !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Tracking number is required' })
      };
    }

    // Update the order with tracking information and set status to 'shipped'
    // Note: tracking_carrier column doesn't exist in database schema, so we only update tracking_number
    const result = await sql`
      UPDATE orders
      SET tracking_number = ${number},
          status = 'shipped',
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

    console.log(`Tracking updated for order ${id}: ${number} - ${new Date().toISOString()}`);

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
