import '@neondatabase/serverless';
import 'resend';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import notifyOrderModule from './_shared/legacy/notify-order.cjs';
import pdfModule from './_shared/legacy/generate-paid-order-pdfs-background.cjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const isSent = (status, sentAt) => status === 'sent' || Boolean(sentAt);

const loadOrder = async (sql, orderId) => {
  const rows = await sql`
    SELECT id, order_number, status, email, customer_name, shipping_name,
           shipping_street, shipping_street2, shipping_city, shipping_state,
           shipping_zip, shipping_country, total_cents, created_at,
           confirmation_email_status, confirmation_emailed_at,
           admin_notification_status, admin_notification_sent_at,
           updated_at
      FROM orders
     WHERE id = ${orderId}
     LIMIT 1
  `;
  return rows[0] || null;
};

const claimCustomerEmail = async (sql, orderId) => {
  const rows = await sql`
    UPDATE orders
       SET confirmation_email_status = 'sending', updated_at = NOW()
     WHERE id = ${orderId}
       AND confirmation_emailed_at IS NULL
       AND COALESCE(confirmation_email_status, '') <> 'sent'
       AND (
         COALESCE(confirmation_email_status, '') <> 'sending'
         OR updated_at < NOW() - INTERVAL '10 minutes'
       )
    RETURNING id
  `;
  return rows.length > 0;
};

const claimAdminEmail = async (sql, orderId) => {
  const rows = await sql`
    UPDATE orders
       SET admin_notification_status = 'sending', updated_at = NOW()
     WHERE id = ${orderId}
       AND admin_notification_sent_at IS NULL
       AND COALESCE(admin_notification_status, '') <> 'sent'
       AND (
         COALESCE(admin_notification_status, '') <> 'sending'
         OR updated_at < NOW() - INTERVAL '10 minutes'
       )
    RETURNING id
  `;
  return rows.length > 0;
};

const sendCustomerConfirmation = async (event, orderId) => {
  const response = await notifyOrderModule.handler({
    ...event,
    httpMethod: 'POST',
    headers: event.headers || {},
    body: JSON.stringify({ orderId, forceResendCustomer: true }),
  });
  let payload = {};
  try { payload = JSON.parse(response?.body || '{}'); } catch { /* no-op */ }
  if (!response || response.statusCode >= 400 || payload?.ok === false) {
    throw new Error(payload?.error || `notify-order returned ${response?.statusCode || 'no response'}`);
  }
};

const sendAdminNotification = async (sql, order, items) => {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY_NOT_CONFIGURED');

  const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';
  const emailFromRaw = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'orders@bannersonthefly.com';
  const emailFrom = emailFromRaw.includes('<') ? emailFromRaw : `Banners on the Fly <${emailFromRaw}>`;
  const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
  const siteUrl = String(process.env.URL || process.env.PUBLIC_SITE_URL || 'https://bannersonthefly.com').replace(/\/$/, '');
  const displayNumber = String(order.order_number || order.id?.slice(-8) || '').toUpperCase();
  const customerName = order.customer_name || order.shipping_name || 'Not provided';
  const itemRows = items.map((item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.product_type || 'banner')}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(`${item.width_in || 0} × ${item.height_in || 0}`)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(item.quantity || 1)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${(Number(item.line_total_cents || 0) / 100).toFixed(2)}</td>
    </tr>
  `).join('');
  const address = [
    order.shipping_name,
    order.shipping_street,
    order.shipping_street2,
    [order.shipping_city, order.shipping_state, order.shipping_zip].filter(Boolean).join(', '),
    order.shipping_country,
  ].filter(Boolean).map(escapeHtml).join('<br>');

  const html = `
    <!doctype html>
    <html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:24px auto;background:white;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 8px;color:#18448D;">New Paid Order #${escapeHtml(displayNumber)}</h1>
        <p style="margin:0 0 20px;color:#4b5563;">A PayPal payment was completed and the order is available in Admin.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:6px 0;font-weight:bold;">Customer</td><td>${escapeHtml(customerName)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold;">Email</td><td>${escapeHtml(order.email || 'Not provided')}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold;">Order ID</td><td>${escapeHtml(order.id)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold;">Total</td><td>$${(Number(order.total_cents || 0) / 100).toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold;vertical-align:top;">Ship to</td><td>${address || 'Not provided'}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:8px;text-align:left;">Product</th><th style="padding:8px;text-align:left;">Size</th><th style="padding:8px;">Qty</th><th style="padding:8px;text-align:right;">Amount</th></tr></thead>
          <tbody>${itemRows || '<tr><td colspan="4" style="padding:8px;">Order items are available in Admin.</td></tr>'}</tbody>
        </table>
        <a href="${escapeHtml(`${siteUrl}/admin/orders?search=${encodeURIComponent(displayNumber)}`)}" style="display:inline-block;background:#ff6b35;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Open Order in Admin</a>
      </div>
    </body></html>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: emailFrom,
    to: adminEmail,
    replyTo,
    subject: `New Paid Order #${displayNumber} - $${(Number(order.total_cents || 0) / 100).toFixed(2)}`,
    html,
    tags: [
      { name: 'type', value: 'order_admin_notification' },
      { name: 'order_id', value: String(order.id) },
    ],
  });

  if (result?.error || !result?.data?.id) {
    throw new Error(result?.error?.message || result?.error || 'ADMIN_EMAIL_PROVIDER_REJECTED');
  }

  await sql`
    UPDATE orders
       SET admin_notification_status = 'sent',
           admin_notification_sent_at = NOW(),
           updated_at = NOW()
     WHERE id = ${order.id}
  `;

  try {
    await sql`
      INSERT INTO email_events (type, to_email, provider_msg_id, status, order_id, created_at)
      VALUES ('order.admin_notification', ${adminEmail}, ${result.data.id}, 'sent', ${order.id}, NOW())
    `;
  } catch (error) {
    console.warn('[paid-order-followups] admin email event log failed', { orderId: order.id, error: error?.message });
  }
};

const handler = async (event) => {
  if (event.httpMethod && event.httpMethod !== 'POST') return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  const expected = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const supplied = event.headers?.['x-internal-job-secret'] || event.headers?.['X-Internal-Job-Secret'];
  if (expected && supplied !== expected) return json(401, { ok: false, error: 'UNAUTHORIZED' });

  let orderId;
  try {
    ({ orderId } = JSON.parse(event.body || '{}'));
  } catch {
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

  const items = await sql`
    SELECT id, product_type, width_in, height_in, quantity, line_total_cents
      FROM order_items
     WHERE order_id = ${orderId}
     ORDER BY id
  `;

  const failures = [];

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

  const customerNeedsSend = !isSent(order.confirmation_email_status, order.confirmation_emailed_at);
  const adminNeedsSend = !isSent(order.admin_notification_status, order.admin_notification_sent_at);

  if (customerNeedsSend && await claimCustomerEmail(sql, orderId)) {
    try {
      await sendCustomerConfirmation(event, orderId);
    } catch (error) {
      failures.push(`Customer confirmation failed: ${error?.message || error}`);
      try {
        await sql`UPDATE orders SET confirmation_email_status = 'error', updated_at = NOW() WHERE id = ${orderId}`;
      } catch { /* no-op */ }
    }
  }

  if (adminNeedsSend && await claimAdminEmail(sql, orderId)) {
    try {
      order = await loadOrder(sql, orderId);
      await sendAdminNotification(sql, order, items);
    } catch (error) {
      failures.push(`Admin notification failed: ${error?.message || error}`);
      try {
        await sql`UPDATE orders SET admin_notification_status = 'error', updated_at = NOW() WHERE id = ${orderId}`;
      } catch { /* no-op */ }
    }
  }

  order = await loadOrder(sql, orderId);
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

  return json(200, { ok: true, orderId, customerEmailSent: true, adminEmailSent: true });
};

export default withLambda(handler);

export const config = {
  background: true,
};
