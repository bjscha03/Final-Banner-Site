import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import serverAuth from './_shared/server-auth.cjs';
import customerInfo from './_shared/update-order-customer-info.cjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const auth = serverAuth.requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  try {
    const body = JSON.parse(event.body || '{}');
    if (!customerInfo.UUID.test(String(body.orderId || ''))) return { statusCode: 400, headers, body: JSON.stringify({ error: 'A valid UUID orderId is required' }) };
    const values = customerInfo.normalizeCustomerInfo(body);
    const reason = String(body.change_reason || 'Corrected customer information from Admin').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 500);
    if (!reason) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Change reason is required' }) };
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('Database configuration missing');
    const order = await customerInfo.updateCustomerInfo(neon(dbUrl), body.orderId, values, auth.session.email || auth.session.sub, reason);
    if (!order) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order not found' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, order }) };
  } catch (error) {
    const validation = /valid customer email|required/.test(error.message);
    return { statusCode: validation ? 400 : 500, headers, body: JSON.stringify({ error: validation ? error.message : 'Unable to update customer information' }) };
  }
}
export default withLambda(handler);
