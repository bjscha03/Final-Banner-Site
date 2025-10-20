const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    const { code, userId } = JSON.parse(event.body || '{}');

    if (!code || typeof code !== 'string') {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ valid: false, error: 'Discount code is required' })
      };
    }

    const normalizedCode = code.trim().toUpperCase();
    console.log('[validate-discount] Validating:', normalizedCode);

    const result = await sql`
      SELECT id, code, discount_percentage, discount_amount_cents, cart_id, single_use, used, used_at, used_by_user_id, expires_at
      FROM discount_codes WHERE code = ${normalizedCode}
    `;

    if (result.length === 0) {
      console.log('[validate-discount] Not found:', normalizedCode);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ valid: false, error: 'Invalid discount code' })
      };
    }

    const discount = result[0];

    if (discount.used) {
      console.log('[validate-discount] Already used:', normalizedCode);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ valid: false, error: 'This discount code has already been used' })
      };
    }

    const now = new Date();
    const expiresAt = new Date(discount.expires_at);
    
    if (now > expiresAt) {
      console.log('[validate-discount] Expired:', normalizedCode, expiresAt);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ valid: false, error: 'This discount code has expired' })
      };
    }

    console.log('[validate-discount] Valid:', {
      code: normalizedCode,
      discountPercentage: discount.discount_percentage,
      discountAmountCents: discount.discount_amount_cents
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        valid: true,
        code: discount.code,
        discountPercentage: discount.discount_percentage,
        discountAmountCents: discount.discount_amount_cents,
        expiresAt: discount.expires_at,
        message: discount.discount_percentage 
          ? `${discount.discount_percentage}% off your order`
          : `$${(discount.discount_amount_cents / 100).toFixed(2)} off your order`
      })
    };
  } catch (error) {
    console.error('[validate-discount] Error:', error);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ valid: false, error: 'Failed to validate discount code' })
    };
  }
};
