import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import auth from './_shared/server-auth.cjs';
import refunds from './_shared/record-partial-refund.cjs';

const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

export async function handler(event) {
  const session = auth.requireAdmin(event);
  if (!session.ok) return session.response;
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
  // Previews can read live orders, but must never change real financial records.
  // Also block immutable deploy permalinks, where CONTEXT may be unavailable.
  const host = String(event.headers?.host || event.headers?.Host || '').toLowerCase();
  const liveHost = ['bannersonthefly.com', 'www.bannersonthefly.com', 'bannersonthefly.netlify.app'].includes(host);
  if (!liveHost || auth.isDeployPreviewEnvironment(event) || session.session.preview) return reply(409, { ok: false, error: 'Refund records can only be saved on the live admin site. This preview does not change financial records.' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'Invalid request body' }); }
  try {
    refunds.validateInput(body);
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return reply(503, { ok: false, error: 'Database configuration missing' });
    const result = await refunds.recordPartialRefund(neon(url), body, session.session.email || session.session.sub);
    return reply(200, { ok: true, ...result, recordOnly: true, paymentRefundInitiated: false, customerEmailSent: false });
  } catch (error) {
    if (error instanceof refunds.PartialRefundError) return reply(error.status, { ok: false, error: error.message });
    console.error('[partial-refund] record failed', { code: error?.code, orderId: body?.orderId });
    return reply(500, { ok: false, error: 'Unable to save the refund record. Please try again.' });
  }
}
export default withLambda(handler);
