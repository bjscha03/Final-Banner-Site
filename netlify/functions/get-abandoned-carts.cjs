const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
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
    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('[get-abandoned-carts] No database URL found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration error' })
      };
    }

    const sql = neon(databaseUrl);

    // Get all carts (including recovered for analytics)
    // NOTE: We don't select cart_contents to avoid massive response sizes
    // cart_contents can contain full banner designs with base64 images (6MB+ response!)
    const carts = await sql`
      SELECT 
        id,
        email,
        phone,
        jsonb_array_length(cart_contents) as item_count,
        total_value,
        recovery_status,
        recovery_emails_sent,
        discount_code,
        last_activity_at,
        abandoned_at,
        recovered_at,
        recovered_order_id,
        created_at
      FROM abandoned_carts
      WHERE recovery_status IN ('active', 'abandoned', 'recovered')
      ORDER BY 
        CASE 
          WHEN recovery_status = 'recovered' THEN 2
          ELSE 1
        END,
        abandoned_at DESC NULLS LAST, 
        last_activity_at DESC
      LIMIT 200
    `;

    // Calculate recovery analytics
    const recoveredCarts = carts.filter(c => c.recovery_status === 'recovered');
    const totalRecovered = recoveredCarts.reduce((sum, c) => sum + parseFloat(c.total_value || 0), 0);
    const recoveredWithEmails = recoveredCarts.filter(c => c.recovery_emails_sent > 0);
    const totalRecoveredFromEmails = recoveredWithEmails.reduce((sum, c) => sum + parseFloat(c.total_value || 0), 0);

    console.log(`[get-abandoned-carts] Found ${carts.length} carts (${recoveredCarts.length} recovered, $${totalRecovered.toFixed(2)} total recovered)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        carts,
        analytics: {
          totalRecovered: totalRecovered,
          totalRecoveredFromEmails: totalRecoveredFromEmails,
          recoveredCount: recoveredCarts.length,
          recoveredFromEmailsCount: recoveredWithEmails.length
        }
      })
    };

  } catch (error) {
    console.error('[get-abandoned-carts] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch abandoned carts',
        message: error.message 
      })
    };
  }
};
