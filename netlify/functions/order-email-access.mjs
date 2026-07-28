import { neon } from '@neondatabase/serverless';
import accessHelpers from './_shared/order-email-access.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  try {
    const { orderId, email } = JSON.parse(event.body || '{}');
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedEmail = accessHelpers.normalizeEmail(email);
    if (!normalizedOrderId || !normalizedEmail) {
      return json(400, { ok: false, error: 'Order ID and email are required' });
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return json(500, { ok: false, error: 'Database not configured' });
    if (!accessHelpers.getSigningSecret()) {
      return json(503, { ok: false, error: 'Secure order access is not configured' });
    }

    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT id::text AS id, email
      FROM orders
      WHERE id::text = ${normalizedOrderId}
         OR UPPER(RIGHT(id::text, 8)) = ${normalizedOrderId.replace(/^#/, '').toUpperCase()}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const order = rows[0];
    if (!order || accessHelpers.normalizeEmail(order.email) !== normalizedEmail) {
      // Deliberately generic so this endpoint cannot be used to discover order/email pairs.
      return json(403, { ok: false, error: 'Order details could not be verified' });
    }

    const token = accessHelpers.createOrderAccessToken(order.id, order.email);
    if (!token) return json(503, { ok: false, error: 'Secure order access is not configured' });

    return json(200, {
      ok: true,
      orderId: order.id,
      token,
      expiresInSeconds: accessHelpers.DEFAULT_TTL_SECONDS,
    });
  } catch (error) {
    console.error('[order-email-access] verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(500, { ok: false, error: 'Unable to verify order access' });
  }
};

export default handler;
