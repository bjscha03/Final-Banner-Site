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
    const { code, email, userId } = JSON.parse(event.body || '{}');

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
    const normalizedCode = code.trim().toUpperCase();
    const normalizedEmail = email ? email.toLowerCase() : null;

    console.log('[validate-discount-code] Validating:', { code: normalizedCode, email: normalizedEmail, userId });

    // SPECIAL HANDLING: NEW20 is a hardcoded first-order-only promo code
    // It doesn't need to exist in the database - we handle it as a special case
    if (normalizedCode === 'NEW20') {
      console.log('[validate-discount-code] NEW20 code detected - checking first-order eligibility');

      // Require email for NEW20 validation
      if (!normalizedEmail) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            valid: false,
            error: 'Please enter your email to use this code'
          })
        };
      }

      // Check if this email has any previous PAID orders
      const existingOrders = await sql`
        SELECT id, status, created_at
        FROM orders
        WHERE email = ${normalizedEmail}
          AND status = 'paid'
        LIMIT 1
      `;

      if (existingOrders.length > 0) {
        console.log('[validate-discount-code] NEW20 rejected - email has prior paid orders:', normalizedEmail);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            valid: false,
            error: 'NEW20 is valid for first-time customers only. You have a previous order with this email.'
          })
        };
      }

      // Also check by user_id if provided
      if (userId) {
        const existingUserOrders = await sql`
          SELECT id, status, created_at
          FROM orders
          WHERE user_id = ${userId}
            AND status = 'paid'
          LIMIT 1
        `;

        if (existingUserOrders.length > 0) {
          console.log('[validate-discount-code] NEW20 rejected - user has prior paid orders:', userId);
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              valid: false,
              error: 'NEW20 is valid for first-time customers only. You have a previous order on this account.'
            })
          };
        }
      }

      // NEW20 is valid for this first-time customer
      console.log('[validate-discount-code] NEW20 approved for first-time customer:', normalizedEmail);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          discount: {
            id: 'NEW20_PROMO',  // Virtual ID for static promo
            code: 'NEW20',
            discountPercentage: 20,
            discountAmountCents: null,
            expiresAt: '2099-12-31T23:59:59Z'  // Never expires
          }
        })
      };
    }

    // Standard discount code lookup for non-NEW20 codes
    const discountCodes = await sql`
      SELECT
        id,
        code,
        discount_percentage,
        discount_amount_cents,
        used,
        expires_at,
        single_use,
        used_by_user_id,
        used_by_email,
        max_uses_per_customer,
        max_total_uses
      FROM discount_codes
      WHERE code = ${normalizedCode}
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

    // Check if this specific user/email has already used it
    if (normalizedEmail && discount.used_by_email) {
      const usedByEmails = Array.isArray(discount.used_by_email) ? discount.used_by_email : [];
      if (usedByEmails.includes(normalizedEmail)) {
        console.log('[validate-discount-code] Email already used:', normalizedEmail);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            valid: false, 
            error: 'You have already used this code' 
          })
        };
      }
    }

    // Note: used_by_user_id is a single UUID field, not an array
    if (userId && discount.used_by_user_id && discount.used_by_user_id === userId) {
      console.log('[validate-discount-code] User ID already used:', userId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'You have already used this code' 
        })
      };
    }

    // Check max total uses if set (count emails in the array)
    if (discount.max_total_uses !== null && discount.max_total_uses !== undefined) {
      const totalUses = discount.used_by_email ? discount.used_by_email.length : 0;
      if (totalUses >= discount.max_total_uses) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            valid: false, 
            error: 'This discount code has reached its maximum number of uses' 
          })
        };
      }
    }

    // Legacy check: if single_use and globally used (for backwards compatibility)
    if (discount.used && discount.single_use && !discount.used_by_email && !discount.used_by_user_id) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'This discount code has already been used' 
        })
      };
    }

    // Code is valid!
    console.log('[validate-discount-code] Valid');
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
