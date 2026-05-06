const { neon } = require('@neondatabase/serverless');
const { handler: notifyOrderHandler } = require('./notify-order.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function isAuthorized(event) {
  const secret = process.env.RESEND_ORDER_EMAIL_SECRET;
  if (!secret) return false;

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = event.headers?.['x-admin-secret'] || event.headers?.['X-Admin-Secret'] || '';
  return bearer === secret || headerSecret === secret;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  if (!isAuthorized(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    let { orderId, latest = false } = body;

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database not configured' }) };

    const db = neon(dbUrl);

    if (!orderId) {
      if (!latest) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Provide orderId or latest=true' }) };
      }

      const latestPaid = await db`
        SELECT id
        FROM orders
        WHERE status = 'paid'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (latestPaid.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'No paid orders found' }) };
      }

      orderId = latestPaid[0].id;
    }

    const notifyResponse = await notifyOrderHandler({
      httpMethod: 'POST',
      headers: event.headers || {},
      body: JSON.stringify({ orderId, forceResendBoth: true }),
    });

    const parsed = JSON.parse(notifyResponse.body || '{}');

    return {
      statusCode: notifyResponse.statusCode || 200,
      headers,
      body: JSON.stringify({
        ok: !!parsed.ok,
        orderId,
        customerEmailSent: !!parsed.customerEmailSent,
        adminEmailSent: !!parsed.adminEmailSent,
        resendMessageIds: parsed.resendMessageIds || { customer: null, admin: null },
        errors: parsed.errors || (parsed.error ? [parsed.error] : []),
      }),
    };
  } catch (error) {
    console.error('[resend-order-emails] failed:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Internal server error', details: error.message }) };
  }
};
