import '@neondatabase/serverless';
import 'resend';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import notifyOrderModule from './_shared/legacy/notify-order.cjs';
import pdfModule from './_shared/legacy/generate-paid-order-pdfs-background.cjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const isSent = (status, sentAt) => status === 'sent' || Boolean(sentAt);

const loadOrder = async (sql, orderId) => {
  const rows = await sql`
    SELECT id, status,
           confirmation_email_status, confirmation_emailed_at,
           admin_notification_status, admin_notification_sent_at
      FROM orders
     WHERE id = ${orderId}
     LIMIT 1
  `;
  return rows[0] || null;
};

const runExistingResendTemplates = async (event, orderId, forceResendBoth = false) => {
  const response = await notifyOrderModule.handler({
    ...event,
    httpMethod: 'POST',
    headers: event.headers || {},
    body: JSON.stringify({
      orderId,
      forceResendBoth,
    }),
  });

  let payload = {};
  try { payload = JSON.parse(response?.body || '{}'); } catch { /* no-op */ }
  if (!response || response.statusCode >= 400 || payload?.ok === false) {
    throw new Error(payload?.error || `notify-order returned ${response?.statusCode || 'no response'}`);
  }
  return payload;
};

const handler = async (event) => {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const expected = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const supplied = event.headers?.['x-internal-job-secret'] || event.headers?.['X-Internal-Job-Secret'];
  if (expected && supplied !== expected) return json(401, { ok: false, error: 'UNAUTHORIZED' });

  let orderId;
  try { ({ orderId } = JSON.parse(event.body || '{}')); } catch {
    return json(400, { ok: false, error: 'INVALID_JSON' });
  }
  if (!orderId) return json(400, { ok: false, error: 'ORDER_ID_REQUIRED' });

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_NOT_CONFIGURED');
  const sql = neon(dbUrl);

  let order = await loadOrder(sql, orderId);
  if (!order) return json(404, { ok: false, error: 'ORDER_NOT_FOUND' });
  if (!['paid', 'in_production', 'shipped'].includes(order.status)) {
    return json(409, { ok: false, error: 'ORDER_NOT_PAID' });
  }

  const failures = [];

  // Production PDF generation remains independent from email delivery. The
  // renderer records per-item failures for the scheduled retry job.
  try {
    const pdfResponse = await pdfModule.handler({
      __internal: true,
      httpMethod: 'POST',
      headers: event.headers || {},
      body: JSON.stringify({ orderId, skipNotifications: true }),
    });
    if (!pdfResponse || pdfResponse.statusCode >= 400) {
      let payload = {};
      try { payload = JSON.parse(pdfResponse?.body || '{}'); } catch { /* no-op */ }
      failures.push(payload?.error || `PDF processing returned ${pdfResponse?.statusCode || 'no response'}`);
    }
  } catch (error) {
    failures.push(`PDF processing failed: ${error?.message || error}`);
  }

  order = await loadOrder(sql, orderId) || order;
  const customerSentBefore = isSent(order.confirmation_email_status, order.confirmation_emailed_at);
  const adminSentBefore = isSent(order.admin_notification_status, order.admin_notification_sent_at);

  if (!customerSentBefore || !adminSentBefore) {
    try {
      // Normal first attempt uses the exact existing notify-order flow and its
      // existing Resend customer/Admin templates without changing their HTML.
      await runExistingResendTemplates(event, orderId, false);
    } catch (error) {
      failures.push(`Order notification failed: ${error?.message || error}`);
    }
  }

  order = await loadOrder(sql, orderId) || order;
  const customerSentAfter = isSent(order.confirmation_email_status, order.confirmation_emailed_at);
  const adminSentAfter = isSent(order.admin_notification_status, order.admin_notification_sent_at);

  if (customerSentAfter && !adminSentAfter) {
    try {
      // Recovery-only fallback. The legacy sender couples the two existing
      // templates, so force both only when the customer succeeded but the Admin
      // delivery was the sole missing action. This guarantees Admin visibility
      // without introducing a second template implementation.
      await runExistingResendTemplates(event, orderId, true);
    } catch (error) {
      failures.push(`Admin notification recovery failed: ${error?.message || error}`);
    }
  }

  order = await loadOrder(sql, orderId) || order;
  if (!isSent(order.confirmation_email_status, order.confirmation_emailed_at)) {
    failures.push('Customer confirmation is not marked sent.');
  }
  if (!isSent(order.admin_notification_status, order.admin_notification_sent_at)) {
    failures.push('Admin notification is not marked sent.');
  }

  if (failures.length) {
    console.error('[paid-order-followups] incomplete', { orderId, failures });
    throw new Error(failures.join(' | '));
  }

  return json(200, {
    ok: true,
    orderId,
    customerEmailSent: true,
    adminEmailSent: true,
  });
};

export default withLambda(handler);

export const config = {
  background: true,
};
