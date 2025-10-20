const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { code } = JSON.parse(event.body || '{}');

    if (!code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Discount code is required' })
      };
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('[validate-discount-code] No database URL found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration error' })
      };
    }

    const sql = neon(databaseUrl);

    // Look up the discount code
    const discountCodes = await sql`
      SELECT 
        id,
        code,
        discount_percentage,
        discount_amount_cents,
        used,
        expires_at,
        single_use
      FROM discount_codes
      WHERE code = ${code.toUpperCase()}
      LIMIT 1
    `;

    if (discountCodes.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'Invalid discount code' 
        })
      };
    }

    const discount = discountCodes[0];

    // Check if already used
    if (discount.used && discount.single_use) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'This discount code has already been used' 
        })
      };
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(discount.expires_at);
    if (expiresAt < now) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'This discount code has expired' 
        })
      };
    }

    // Code is valid!
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        valid: true,
        discount: {
          id: discount.id,
          code: discount.code,
          discountPercentage: discount.discount_percentage,
          discountAmountCents: discount.discount_amount_cents,
          expiresAt: discount.expires_at
        }
      })
    };

  } catch (error) {
    console.error('[validate-discount-code] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to validate discount code',
        message: error.message 
      })
    };
  }
};
