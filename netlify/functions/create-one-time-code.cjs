/**
 * create-one-time-code
 *
 * Admin endpoint to create a one-time-use discount code (e.g. CUSTOM60).
 *
 * Authorization: Requires the `x-admin-secret` header to match the
 * ADMIN_SECRET environment variable.
 *
 * Request body (JSON):
 *   code              string   Code name (default: "CUSTOM60")
 *   discountPercentage number  1–100 (default: 60)
 *   email             string   Optional – restrict code to a specific customer
 *   expiresInDays     number   Days until expiry (default: 7; 0 = never)
 *
 * Response (JSON):
 *   success   boolean
 *   code      string
 *   discountPercentage number
 *   expiresAt string | null
 *   alreadyExists boolean  (true when the code already exists in DB)
 */

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // ── Admin authentication ───────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error('[create-one-time-code] ADMIN_SECRET env var is not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  const providedSecret = event.headers['x-admin-secret'] || '';
  if (providedSecret !== adminSecret) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const {
    code: rawCode = 'CUSTOM60',
    discountPercentage = 60,
    email: rawEmail,
    expiresInDays = 7,
  } = body;

  const code = String(rawCode).trim().toUpperCase();
  const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;

  if (!code) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'code is required' }),
    };
  }

  if (typeof discountPercentage !== 'number' || discountPercentage < 1 || discountPercentage > 100) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'discountPercentage must be a number between 1 and 100' }),
    };
  }

  // ── Database ──────────────────────────────────────────────────────────────
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.VITE_DATABASE_URL;

  if (!databaseUrl) {
    console.error('[create-one-time-code] No database URL configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Database configuration error' }),
    };
  }

  const sql = neon(databaseUrl);

  try {
    // Check if code already exists
    const existing = await sql`
      SELECT id, code, discount_percentage, used, expires_at
      FROM discount_codes
      WHERE code = ${code}
      LIMIT 1
    `;

    if (existing.length > 0) {
      console.log('[create-one-time-code] Code already exists:', code);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          alreadyExists: true,
          code: existing[0].code,
          discountPercentage: existing[0].discount_percentage,
          used: existing[0].used,
          expiresAt: existing[0].expires_at,
          message: 'Code already exists in the database.',
        }),
      };
    }

    // Compute expiry
    let expiresAt = null;
    if (expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // Set a far-future date so the existing expiry check passes
      expiresAt = '2099-12-31T23:59:59Z';
    }

    // Insert the one-time-use code
    const result = await sql`
      INSERT INTO discount_codes (
        code,
        discount_percentage,
        email,
        single_use,
        max_total_uses,
        used,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        ${code},
        ${discountPercentage},
        ${email},
        TRUE,
        1,
        FALSE,
        ${expiresAt},
        NOW(),
        NOW()
      )
      RETURNING id, code, discount_percentage, expires_at
    `;

    console.log('[create-one-time-code] Created:', {
      code: result[0].code,
      discountPercentage: result[0].discount_percentage,
      email,
      expiresAt: result[0].expires_at,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        alreadyExists: false,
        code: result[0].code,
        discountPercentage: result[0].discount_percentage,
        expiresAt: result[0].expires_at,
        ...(email ? { restrictedToEmail: email } : {}),
        message: `One-time ${discountPercentage}% discount code "${result[0].code}" created successfully.`,
      }),
    };
  } catch (error) {
    console.error('[create-one-time-code] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
