import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-orders.cjs';

/**
 * The legacy get-orders formatter intentionally returns a curated object, but
 * the payment identifiers were omitted during the Netlify-function migration.
 * That made captured PayPal orders still look "pending" to Admin, which hid the
 * existing Mark In Production action.
 *
 * Keep the proven legacy order query untouched, then enrich only the returned
 * rows with authoritative payment evidence. If the enrichment query ever
 * fails, return the original response rather than breaking Admin Orders.
 */
const handler = async (event, context) => {
  const response = await legacyModule.handler(event, context);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode < 200 || statusCode >= 300 || !response?.body) return response;

  let orders;
  try {
    orders = JSON.parse(response.body);
  } catch {
    return response;
  }
  if (!Array.isArray(orders) || orders.length === 0) return response;

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return response;

  const ids = orders
    .map((order) => String(order?.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return response;

  try {
    const sql = neon(dbUrl);
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const paymentRows = await sql(
      `SELECT id::text AS id,
              payment_method,
              paypal_order_id,
              paypal_capture_id,
              stripe_charge_id,
              stripe_payment_intent_id
         FROM orders
        WHERE id::text IN (${placeholders})`,
      ids,
    );
    const paymentById = new Map(paymentRows.map((row) => [String(row.id), row]));

    response.body = JSON.stringify(orders.map((order) => {
      const payment = paymentById.get(String(order.id));
      if (!payment) return order;

      const hasCompletedCapture = Boolean(payment.paypal_capture_id || payment.stripe_charge_id);
      const effectiveStatus = order.status === 'pending' && hasCompletedCapture
        ? 'paid'
        : order.status;

      return {
        ...order,
        status: effectiveStatus,
        payment_method: payment.payment_method || order.payment_method || null,
        paypal_order_id: payment.paypal_order_id || order.paypal_order_id || null,
        paypal_capture_id: payment.paypal_capture_id || order.paypal_capture_id || null,
        stripe_charge_id: payment.stripe_charge_id || order.stripe_charge_id || null,
        stripe_payment_intent_id: payment.stripe_payment_intent_id || order.stripe_payment_intent_id || null,
      };
    }));
  } catch (error) {
    console.error('[get-orders] payment metadata enrichment failed; returning base order response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
};

export default withLambda(handler);
