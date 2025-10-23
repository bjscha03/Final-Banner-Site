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

    // Look up the discount code with per-user tracking fields
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
