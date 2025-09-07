// netlify/functions/resend-webhook.js
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

function verify(sig, raw) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const raw = event.body || '';
  const sig = event.headers['x-resend-signature'] || event.headers['X-Resend-Signature'];

  if (!verify(sig, raw)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'BAD_SIGNATURE' }) };
  }

  const evt = JSON.parse(raw);
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const db = neon(dbUrl);

  const providerMsgId =
    (evt && evt.data && (evt.data.email_id || (evt.data.email && evt.data.email.id) || evt.data.id)) || null;

  const toEmail = Array.isArray(evt?.data?.to)
    ? evt.data.to[0]
    : (evt?.data?.to || (Array.isArray(evt?.data?.email?.to) ? evt.data.email.to[0] : evt?.data?.email?.to) || null);

  // log raw event
  await db`
    INSERT INTO email_events (event_type, provider, provider_msg_id, to_email, raw)
    VALUES (${evt.type}, 'resend', ${providerMsgId}, ${toEmail}, ${evt})
  `;

  const statusMap = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.opened': 'opened'
  };
  const newStatus = statusMap[evt.type];

  if (providerMsgId && newStatus) {
    // Update email_events table
    const result = await db`
      UPDATE email_events
      SET status = ${newStatus}
      WHERE provider_msg_id = ${providerMsgId} AND status <> ${newStatus}
    `;

    // Also update orders.confirmation_email_status if this is an order confirmation
    if (evt.data && evt.data.tags) {
      const orderIdTag = evt.data.tags.find(tag => tag.name === 'order_id');
      if (orderIdTag && orderIdTag.value) {
        await db`
          UPDATE orders
          SET confirmation_email_status = ${newStatus}
          WHERE id = ${orderIdTag.value}
        `;
      }
    }

    console.log('webhook update', { providerMsgId, newStatus, rowCount: result.count || result.rowCount });
  }

  return { statusCode: 200, body: 'ok' };
};
