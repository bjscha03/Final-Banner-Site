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
    const { code, orderId, userId } = JSON.parse(event.body || '{}');

    if (!code || !orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'code and orderId are required' }) };
    }

    const normalizedCode = code.trim().toUpperCase();
    console.log('[apply-discount] Applying:', { code: normalizedCode, orderId, userId });

    const result = await sql`
      UPDATE discount_codes
      SET used = TRUE, used_at = NOW(), used_by_user_id = ${userId || null}, order_id = ${orderId}, updated_at = NOW()
      WHERE code = ${normalizedCode} AND used = FALSE
      RETURNING id, code, cart_id, discount_percentage, discount_amount_cents
    `;

    if (result.length === 0) {
      console.log('[apply-discount] Not found or already used:', normalizedCode);
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Discount code not found or already used' }) };
    }

    const discount = result[0];

    // Mark cart as recovered if applicable
    if (discount.cart_id) {
      await sql`
        UPDATE abandoned_carts
        SET recovery_status = 'recovered', updated_at = NOW()
        WHERE id = ${discount.cart_id} AND recovery_status != 'recovered'
      `;

      await sql`
        INSERT INTO cart_recovery_logs (abandoned_cart_id, event_type, metadata, created_at)
        VALUES (${discount.cart_id}, 'cart_recovered', ${JSON.stringify({ orderId, discountCode: normalizedCode })}::jsonb, NOW())
      `;

      console.log('[apply-discount] Cart recovered:', discount.cart_id);
    }

    console.log('[apply-discount] Success');

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        code: discount.code,
        discountPercentage: discount.discount_percentage,
        discountAmountCents: discount.discount_amount_cents
      })
    };
  } catch (error) {
    console.error('[apply-discount] Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
