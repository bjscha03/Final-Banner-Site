/**
 * Save Cart Snapshot for Abandoned Cart Recovery
 * 
 * This function saves a snapshot of the user's cart to the abandoned_carts table.
 * It's called whenever the cart is updated (debounced on the frontend).
 * 
 * For logged-in users: uses user_id
 * For guests: uses session_id from cookie
 */

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Calculate total value from cart items
 */
function calculateTotalValue(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return 0;
  }
  
  const totalCents = cartItems.reduce((sum, item) => {
    return sum + (item.line_total_cents || 0);
  }, 0);
  
  return (totalCents / 100).toFixed(2); // Convert to dollars
}

/**
 * Extract UTM parameters from referrer or metadata
 */
function extractUTMParams(metadata) {
  return {
    utm_source: metadata?.utm_source || null,
    utm_medium: metadata?.utm_medium || null,
    utm_campaign: metadata?.utm_campaign || null
  };
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
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
    // Get database connection
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const sql = neon(DATABASE_URL);
    
    // Validate UUID format for userId (PostgreSQL UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Parse request body
    const {
      userId,
      sessionId,
      email,
      phone,
      cartItems,
      metadata
    } = JSON.parse(event.body || '{}');

    // Validation: must have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Either userId or sessionId is required' })
      };
    }

    // Validation: cartItems must be an array
    if (!Array.isArray(cartItems)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'cartItems must be an array' })
      };
    }

    // Calculate total value
    const totalValue = calculateTotalValue(cartItems);

    // Extract UTM parameters
    const { utm_source, utm_medium, utm_campaign } = extractUTMParams(metadata);

    console.log('[save-cart-snapshot] Saving cart snapshot:', {
      userId: userId ? `${userId.substring(0, 8)}...` : null,
      sessionId: sessionId ? `${sessionId.substring(0, 12)}...` : null,
      itemCount: cartItems.length,
      totalValue,
      hasEmail: !!email
    });

    // Validate userId is a valid UUID before attempting database operations
    if (userId && !uuidRegex.test(userId)) {
      console.log('[save-cart-snapshot] Invalid UUID format for userId, skipping snapshot');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Snapshot skipped for invalid userId' })
      };
    }

    // Upsert to abandoned_carts table
    if (userId) {
      // For logged-in users
      const result = await sql`
        INSERT INTO abandoned_carts (
          user_id,
          email,
          phone,
          cart_contents,
          total_value,
          last_activity_at,
          recovery_status,
          utm_source,
          utm_medium,
          utm_campaign,
          created_at,
          updated_at
        ) VALUES (
          ${userId},
          ${email || null},
          ${phone || null},
          ${JSON.stringify(cartItems)}::jsonb,
          ${totalValue},
          NOW(),
          'active',
          ${utm_source},
          ${utm_medium},
          ${utm_campaign},
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id) 
        WHERE recovery_status = 'active' AND user_id IS NOT NULL
        DO UPDATE SET
          email = COALESCE(EXCLUDED.email, abandoned_carts.email),
          phone = COALESCE(EXCLUDED.phone, abandoned_carts.phone),
          cart_contents = EXCLUDED.cart_contents,
          total_value = EXCLUDED.total_value,
          last_activity_at = EXCLUDED.last_activity_at,
          utm_source = COALESCE(EXCLUDED.utm_source, abandoned_carts.utm_source),
          utm_medium = COALESCE(EXCLUDED.utm_medium, abandoned_carts.utm_medium),
          utm_campaign = COALESCE(EXCLUDED.utm_campaign, abandoned_carts.utm_campaign),
          updated_at = NOW()
        RETURNING id, recovery_status
      `;

      console.log('[save-cart-snapshot] Saved for user:', result[0]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          cartId: result[0].id,
          status: result[0].recovery_status
        })
      };

    } else if (sessionId) {
      // For guest users
      const result = await sql`
        INSERT INTO abandoned_carts (
          session_id,
          email,
          phone,
          cart_contents,
          total_value,
          last_activity_at,
          recovery_status,
          utm_source,
          utm_medium,
          utm_campaign,
          created_at,
          updated_at
        ) VALUES (
          ${sessionId},
          ${email || null},
          ${phone || null},
          ${JSON.stringify(cartItems)}::jsonb,
          ${totalValue},
          NOW(),
          'active',
          ${utm_source},
          ${utm_medium},
          ${utm_campaign},
          NOW(),
          NOW()
        )
        ON CONFLICT (session_id) 
        WHERE recovery_status = 'active' AND session_id IS NOT NULL
        DO UPDATE SET
          email = COALESCE(EXCLUDED.email, abandoned_carts.email),
          phone = COALESCE(EXCLUDED.phone, abandoned_carts.phone),
          cart_contents = EXCLUDED.cart_contents,
          total_value = EXCLUDED.total_value,
          last_activity_at = EXCLUDED.last_activity_at,
          utm_source = COALESCE(EXCLUDED.utm_source, abandoned_carts.utm_source),
          utm_medium = COALESCE(EXCLUDED.utm_medium, abandoned_carts.utm_medium),
          utm_campaign = COALESCE(EXCLUDED.utm_campaign, abandoned_carts.utm_campaign),
          updated_at = NOW()
        RETURNING id, recovery_status
      `;

      console.log('[save-cart-snapshot] Saved for guest:', result[0]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          cartId: result[0].id,
          status: result[0].recovery_status
        })
      };
    }

  } catch (error) {
    console.error('[save-cart-snapshot] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to save cart snapshot',
        message: error.message
      })
    };
  }
};
