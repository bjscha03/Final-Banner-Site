#!/bin/bash

# Create detect-abandoned-carts.cjs
cat > netlify/functions/detect-abandoned-carts.cjs << 'EOF1'
/**
 * Detect Abandoned Carts - Scheduled Function
 * Schedule: 0 * * * * (every hour)
 */

const { neon } = require('@neondatabase/serverless');
const { schedule } = require('@netlify/functions');

async function triggerRecoveryEmail(cartId, sequenceNumber = 1) {
  try {
    const functionUrl = process.env.URL 
      ? `${process.env.URL}/.netlify/functions/send-abandoned-cart-email`
      : 'http://localhost:8888/.netlify/functions/send-abandoned-cart-email';

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartId, sequenceNumber })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to trigger email for cart ${cartId}:`, error);
      return false;
    }

    const result = await response.json();
    console.log(`Email triggered for cart ${cartId}:`, result);
    return true;
  } catch (error) {
    console.error(`Error triggering email for cart ${cartId}:`, error);
    return false;
  }
}

const handler = async (event, context) => {
  console.log('[detect-abandoned-carts] Starting...');

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);

    // STEP 1: Find newly abandoned carts (1 hour old)
    const newlyAbandoned = await sql`
      SELECT id, user_id, session_id, email, total_value, cart_contents, last_activity_at
      FROM abandoned_carts
      WHERE recovery_status = 'active'
        AND last_activity_at < NOW() - INTERVAL '1 hour'
        AND last_activity_at > NOW() - INTERVAL '72 hours'
        AND total_value > 0
        AND email IS NOT NULL
        AND email != ''
      ORDER BY last_activity_at DESC
    `;

    console.log(`Found ${newlyAbandoned.length} newly abandoned carts`);

    for (const cart of newlyAbandoned) {
      try {
        await sql`
          UPDATE abandoned_carts
          SET recovery_status = 'abandoned', abandoned_at = NOW(), updated_at = NOW()
          WHERE id = ${cart.id}
        `;
        console.log(`Marked cart ${cart.id} as abandoned`);
        await triggerRecoveryEmail(cart.id, 1);
      } catch (error) {
        console.error(`Error processing cart ${cart.id}:`, error);
      }
    }

    // STEP 2: 2nd email (24 hours)
    const readyForEmail2 = await sql`
      SELECT ac.id FROM abandoned_carts ac
      WHERE ac.recovery_status = 'abandoned'
        AND ac.abandoned_at < NOW() - INTERVAL '24 hours'
        AND ac.abandoned_at > NOW() - INTERVAL '72 hours'
        AND ac.recovery_emails_sent = 1
        AND ac.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM cart_recovery_logs crl
          WHERE crl.abandoned_cart_id = ac.id AND crl.event_type = 'email_clicked'
        )
    `;

    console.log(`Found ${readyForEmail2.length} carts ready for 2nd email`);
    for (const cart of readyForEmail2) {
      await triggerRecoveryEmail(cart.id, 2);
    }

    // STEP 3: 3rd email (72 hours)
    const readyForEmail3 = await sql`
      SELECT ac.id FROM abandoned_carts ac
      WHERE ac.recovery_status = 'abandoned'
        AND ac.abandoned_at < NOW() - INTERVAL '72 hours'
        AND ac.abandoned_at > NOW() - INTERVAL '96 hours'
        AND ac.recovery_emails_sent = 2
        AND ac.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM cart_recovery_logs crl
          WHERE crl.abandoned_cart_id = ac.id AND crl.event_type = 'email_clicked'
        )
    `;

    console.log(`Found ${readyForEmail3.length} carts ready for 3rd email`);
    for (const cart of readyForEmail3) {
      await triggerRecoveryEmail(cart.id, 3);
    }

    // STEP 4: Expire old carts
    const expired = await sql`
      UPDATE abandoned_carts
      SET recovery_status = 'expired', updated_at = NOW()
      WHERE recovery_status = 'abandoned' AND abandoned_at < NOW() - INTERVAL '96 hours'
      RETURNING id
    `;

    console.log(`Expired ${expired.length} old carts`);

    const summary = {
      newlyAbandoned: newlyAbandoned.length,
      email2Sent: readyForEmail2.length,
      email3Sent: readyForEmail3.length,
      expired: expired.length,
      timestamp: new Date().toISOString()
    };

    return { statusCode: 200, body: JSON.stringify({ success: true, ...summary }) };
  } catch (error) {
    console.error('[detect-abandoned-carts] Fatal error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

exports.handler = schedule('0 * * * *', handler);
EOF1

# Create generate-discount.cjs
cat > netlify/functions/generate-discount.cjs << 'EOF2'
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
EOF2

# Create validate-discount.cjs
cat > netlify/functions/validate-discount.cjs << 'EOF3'
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
EOF3

# Create apply-discount.cjs
cat > netlify/functions/apply-discount.cjs << 'EOF4'
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
EOF4

echo "✅ All 4 functions created successfully!"
ls -lh netlify/functions/*discount*.cjs netlify/functions/detect-abandoned-carts.cjs

