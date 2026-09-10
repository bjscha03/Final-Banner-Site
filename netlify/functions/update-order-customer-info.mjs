import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import serverAuth from './_shared/server-auth.cjs';
import customerInfo from './_shared/update-order-customer-info.cjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

let schemaReady = false;
async function ensureCustomerInfoSchema(sql) {
  if (schemaReady) return;

  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_phone TEXT,
      ADD COLUMN IF NOT EXISTS customer_info_admin_updated_at TIMESTAMP WITH TIME ZONE
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS order_customer_info_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      changed_by TEXT NOT NULL,
      previous_values JSONB NOT NULL,
      updated_values JSONB NOT NULL,
      change_reason TEXT NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_order_customer_info_audit_order_id
      ON order_customer_info_audit(order_id, changed_at DESC)
  `;

  schemaReady = true;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const auth = serverAuth.requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    if (!customerInfo.UUID.test(String(body.orderId || ''))) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'A valid UUID orderId is required' }) };
    }

    const values = customerInfo.normalizeCustomerInfo(body);
    const reason = String(body.change_reason || 'Corrected customer information from Admin')
      .replace(/[<>\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 500);
    if (!reason) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Change reason is required' }) };

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('Database configuration missing');

    const sql = neon(dbUrl);
    await ensureCustomerInfoSchema(sql);

    const order = await customerInfo.updateCustomerInfo(
      sql,
      body.orderId,
      values,
      auth.session.email || auth.session.sub,
      reason,
    );

    if (!order) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order not found' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, order }) };
  } catch (error) {
    console.error('[update-order-customer-info] failed', {
      message: error?.message || String(error),
      code: error?.code || null,
    });
    const validation = /valid customer email|required/.test(error.message);
    return {
      statusCode: validation ? 400 : 500,
      headers,
      body: JSON.stringify({
        error: validation ? error.message : 'Unable to update customer information',
        code: error?.code || null,
      }),
    };
  }
}

export default withLambda(handler);
