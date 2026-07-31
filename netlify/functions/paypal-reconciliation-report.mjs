import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import auth from './_shared/server-auth.cjs';

const handler = async (event) => {
  const authorized = auth.requireAdmin(event);
  if (!authorized.ok) return authorized.response;
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return { statusCode: 500, body: JSON.stringify({ error: 'DATABASE_NOT_CONFIGURED' }) };
  const filter = new URLSearchParams(event.rawQuery || event.rawUrl?.split('?')[1] || '').get('filter') || 'all';
  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT o.id, o.order_number, o.email, o.customer_name, o.total_cents, o.status,
      o.paypal_order_id AS linked_paypal_order_id, o.paypal_capture_id AS linked_paypal_capture_id,
      o.payment_reconciliation_status, o.created_at, o.updated_at,
      MIN(oi.thumbnail_url) AS artwork_thumbnail,
      COALESCE(jsonb_agg(jsonb_build_object(
        'paypalOrderId', p.paypal_order_id, 'captureId', p.paypal_capture_id,
        'captureStatus', p.capture_status, 'orderStatus', p.paypal_order_status,
        'source', p.source, 'processingStatus', p.processing_status,
        'duplicateSuspected', p.duplicate_suspected, 'reason', COALESCE(p.error_code, p.error_message),
        'amountCents', p.amount_cents, 'currency', p.currency, 'eventId', p.paypal_event_id,
        'createdAt', p.created_at
      ) ORDER BY p.created_at) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS attempts,
      COUNT(DISTINCT p.paypal_order_id) FILTER (WHERE p.paypal_order_id IS NOT NULL) AS paypal_order_count,
      COUNT(DISTINCT p.paypal_capture_id) FILTER (WHERE p.capture_status = 'COMPLETED') AS completed_capture_count,
      BOOL_OR(p.amount_cents IS NOT NULL AND p.amount_cents <> o.total_cents) AS amount_mismatch,
      BOOL_OR(p.processing_status = 'unmatched') AS unmatched_webhook
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN paypal_payment_attempts p ON p.internal_order_id = o.id::text
    WHERE o.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `;
  const filtered = rows.filter((row) => ({
    multiple_orders: Number(row.paypal_order_count) > 1,
    multiple_captures: Number(row.completed_capture_count) > 1,
    capture_without_paid_order: Number(row.completed_capture_count) > 0 && row.status !== 'paid',
    paid_without_capture: row.status === 'paid' && Number(row.completed_capture_count) === 0,
    unmatched_webhook: row.unmatched_webhook,
    amount_mismatch: row.amount_mismatch,
  }[filter] ?? true));
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ generatedAt: new Date().toISOString(), days: 14, filter, orders: filtered }) };
};
export default withLambda(handler);
