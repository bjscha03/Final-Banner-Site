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
    const { code, orderId, userId, email } = JSON.parse(event.body || '{}');

    if (!code || !orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'code and orderId are required' }) };
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedEmail = email ? email.toLowerCase() : null;
    console.log('[apply-discount] Applying:', { code: normalizedCode, orderId, userId, email: normalizedEmail });

    // First, check if the code exists and if user has already used it
    const existingCode = await sql`
      SELECT id, code, cart_id, discount_percentage, discount_amount_cents, used, used_by_email, used_by_user_id, single_use
      FROM discount_codes
      WHERE code = ${normalizedCode}
      LIMIT 1
    `;

    if (existingCode.length === 0) {
      console.log('[apply-discount] Code not found:', normalizedCode);
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Discount code not found' }) };
    }

    const codeData = existingCode[0];

    // Check if user has already used this code via email tracking
    if (normalizedEmail && codeData.used_by_email && codeData.used_by_email.includes(normalizedEmail)) {
      console.log('[apply-discount] Email already used this code:', normalizedEmail);
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'You have already used this code' }) };
    }

    // Note: used_by_user_id is a single UUID field in the database
    // We only check if this specific user has used it (stored as the single value)
    // For multi-use tracking, we rely on the used_by_email array
    if (userId && codeData.used_by_user_id && codeData.used_by_user_id === userId) {
      console.log('[apply-discount] User already used this code:', userId);
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'You have already used this code' }) };
    }

    // Update the code to mark it as used by this user/email
    // For used_by_user_id: only set it if it's not already set (single UUID field)
    // For used_by_email: append to the array
    const result = await sql`
      UPDATE discount_codes
      SET 
        used = TRUE, 
        used_at = NOW(), 
        used_by_user_id = COALESCE(used_by_user_id, ${userId}::UUID),
        used_by_email = CASE 
          WHEN ${normalizedEmail}::TEXT IS NOT NULL THEN 
            COALESCE(used_by_email, ARRAY[]::TEXT[]) || ARRAY[${normalizedEmail}::TEXT]
          ELSE used_by_email
        END,
        order_id = ${orderId}, 
        updated_at = NOW()
      WHERE code = ${normalizedCode}
      RETURNING id, code, cart_id, discount_percentage, discount_amount_cents
    `;

    if (result.length === 0) {
      console.log('[apply-discount] Failed to update code:', normalizedCode);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to apply discount code' }) };
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
