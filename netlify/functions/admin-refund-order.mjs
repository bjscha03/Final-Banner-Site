import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import serverAuth from './_shared/server-auth.cjs';
import refundOrder from './_shared/admin-refund-order.cjs';
import refundEmail from './_shared/refund-order-email.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = serverAuth.requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'Request body must be valid JSON' });
  }

  const orderId = String(body.orderId || '').trim();
  if (!refundOrder.UUID.test(orderId)) {
    return reply(400, { ok: false, error: 'A valid UUID orderId is required' });
  }

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return reply(500, { ok: false, error: 'Database configuration missing' });

    const sql = neon(dbUrl);
    // Validate the recipient and email transport before changing the order.
    // This prevents a missing address or missing Resend configuration from
    // silently creating a refunded order with no customer notification.
    const emailOrder = await refundEmail.prepareRefundEmail(sql, orderId);
    const result = await refundOrder.markOrderRefunded(sql, orderId);
    if (result.outcome === 'not_found') {
      return reply(404, { ok: false, error: 'Order not found' });
    }
    if (result.outcome === 'invalid_status') {
      return reply(409, {
        ok: false,
        error: `Orders with status "${result.previousStatus || 'unknown'}" cannot be marked as refunded.`,
        code: 'ORDER_NOT_REFUNDABLE',
      });
    }

    const emailResult = await refundEmail.sendRefundEmailOnce({
      sql,
      order: emailOrder,
      adminIdentifier: auth.session.email || auth.session.sub,
    });

    return reply(200, {
      ok: true,
      order: result.order,
      previousStatus: result.previousStatus,
      alreadyRefunded: result.outcome === 'already_refunded',
      customerEmail: {
        sent: emailResult.outcome === 'sent',
        alreadySent: emailResult.outcome === 'already_sent',
        sentAt: emailResult.sentAt || null,
      },
      recordOnly: true,
      paymentRefundInitiated: false,
    });
  } catch (error) {
    console.error('[admin-refund-order] failed', {
      message: error?.message || String(error),
      code: error?.code || null,
      orderId,
      admin: auth.session.email || auth.session.sub,
    });
    if (error instanceof refundEmail.RefundEmailError) {
      return reply(error.statusCode, { ok: false, code: error.code, error: error.message });
    }
    return reply(500, { ok: false, error: 'Unable to mark the order as cancelled/refunded' });
  }
}

export default withLambda(handler);
