const { neon } = require('@neondatabase/serverless');
const { validateDiscountForCheckout } = require('../discount-validation.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { valid: false, error: 'Invalid request body' });
  }

  if (!payload.code || typeof payload.code !== 'string') {
    return reply(400, { valid: false, error: 'Discount code is required' });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!databaseUrl) {
    console.error('[validate-discount-code] No database URL found');
    return reply(500, { valid: false, error: 'Database configuration error' });
  }

  try {
    const sql = neon(databaseUrl);
    const result = await validateDiscountForCheckout({
      sql,
      code: payload.code,
      email: payload.email || null,
      userId: payload.userId || null,
      recoveryCartId: payload.cartId || null,
      requireRecoveryCartMatch: true,
    });
    return reply(200, result);
  } catch (error) {
    console.error('[validate-discount-code] Error:', error);
    return reply(500, { valid: false, error: 'Failed to validate discount code' });
  }
};
