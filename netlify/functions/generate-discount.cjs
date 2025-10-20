const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function createDiscountCode(percentage) {
  const shortId = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CART${percentage}-${shortId}`;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    const { cartId, discountPercentage = 10, expirationHours = 48 } = JSON.parse(event.body || '{}');

    if (!cartId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'cartId is required' }) };
    }

    if (discountPercentage < 1 || discountPercentage > 100) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'discountPercentage must be 1-100' }) };
    }

    const cart = await sql`SELECT id, email, total_value, discount_code FROM abandoned_carts WHERE id = ${cartId}`;
    if (cart.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cart not found' }) };
    }

    // Return existing code if valid
    if (cart[0].discount_code) {
      const existing = await sql`
        SELECT code, discount_percentage, expires_at, used
        FROM discount_codes WHERE code = ${cart[0].discount_code}
      `;
      if (existing.length > 0 && !existing[0].used) {
        console.log('[generate-discount] Returning existing code:', existing[0].code);
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            success: true,
            code: existing[0].code,
            discountPercentage: existing[0].discount_percentage,
            expiresAt: existing[0].expires_at,
            isExisting: true
          })
        };
      }
    }

    // Create new code
    const code = createDiscountCode(discountPercentage);
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    console.log('[generate-discount] Creating:', { code, cartId, discountPercentage, expiresAt });

    const result = await sql`
      INSERT INTO discount_codes (code, discount_percentage, cart_id, single_use, used, expires_at, created_at, updated_at)
      VALUES (${code}, ${discountPercentage}, ${cartId}, TRUE, FALSE, ${expiresAt.toISOString()}, NOW(), NOW())
      RETURNING id, code, discount_percentage, expires_at
    `;

    await sql`UPDATE abandoned_carts SET discount_code = ${code}, updated_at = NOW() WHERE id = ${cartId}`;

    console.log('[generate-discount] Created:', result[0]);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        code: result[0].code,
        discountPercentage: result[0].discount_percentage,
        expiresAt: result[0].expires_at,
        isExisting: false
      })
    };
  } catch (error) {
    console.error('[generate-discount] Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
