// netlify/functions/resend-webhook.js
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');

function header(event, name) {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function verify(event, raw) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return null;
  const signatureHeaders = {
    id: String(header(event, 'svix-id')),
    timestamp: String(header(event, 'svix-timestamp')),
    signature: String(header(event, 'svix-signature')),
  };
  if (Object.values(signatureHeaders).some((value) => !value)) return null;
  try {
    return new Resend().webhooks.verify({
      payload: raw,
      headers: signatureHeaders,
      webhookSecret: secret,
    });
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(String(event.body || ''), 'base64').toString('utf8')
    : String(event.body || '');
  const evt = verify(event, raw);
  if (!evt) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'BAD_SIGNATURE' }) };
  }
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const db = neon(dbUrl);

  const providerMsgId =
    (evt && evt.data && (evt.data.email_id || (evt.data.email && evt.data.email.id) || evt.data.id)) || null;

  const toEmail = Array.isArray(evt?.data?.to)
    ? evt.data.to[0]
    : (evt?.data?.to || (Array.isArray(evt?.data?.email?.to) ? evt.data.email.to[0] : evt?.data?.email?.to) || null);

  const statusMap = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.opened': 'opened'
  };
  const newStatus = statusMap[evt.type];

  if (providerMsgId && newStatus) {
    // Update email_events table with status precedence: complained > bounced > delivered > opened > sent
    const statusPrecedence = {
      'complained': 5,
      'bounced': 4,
      'delivered': 3,
      'opened': 2,
      'sent': 1,
      'error': 0
    };

    // Only update if new status has higher precedence
    const result = await db`
      UPDATE email_events
      SET status = ${newStatus}
      WHERE provider_msg_id = ${providerMsgId}
        AND (
          status = 'sent'
          OR (status = 'opened' AND ${newStatus} IN ('delivered', 'bounced', 'complained'))
          OR (status = 'delivered' AND ${newStatus} IN ('bounced', 'complained'))
          OR (status = 'bounced' AND ${newStatus} = 'complained')
        )
    `;

    // Extract order ID and email type from tags so we can update the
    // appropriate per-email-type status column on the order.
    let orderId = null;
    let emailTypeTag = null;
    if (evt.data && evt.data.tags) {
      const tags = Array.isArray(evt.data.tags)
        ? evt.data.tags
        : Object.entries(evt.data.tags).map(([name, value]) => ({ name, value }));
      const orderIdTag = tags.find(tag => tag.name === 'order_id');
      if (orderIdTag && orderIdTag.value) {
        orderId = orderIdTag.value;
      }
      const typeTag = tags.find(tag => tag.name === 'type');
      if (typeTag && typeTag.value) {
        emailTypeTag = typeTag.value;
      }
    }

    if (orderId) {
      // Map the Resend `type` tag to the orders column we should update.
      // Tag values are emitted by:
      //   notify-order.cjs                -> 'order_confirmation' / 'order_admin_notification'
      //   admin-resend-confirmation.cjs   -> 'order_confirmation'
      //   mark-in-production.cjs          -> 'order_in_production'
      //   send-shipping-notification.cjs  -> 'order_shipped'
      // For backwards compatibility (older sent emails had no `type` tag),
      // we default to updating confirmation_email_status.
      const tagToColumn = {
        order_confirmation: 'confirmation_email_status',
        order_admin_notification: null, // admin notifications don't need a per-order column
        order_in_production: 'production_email_status',
        order_shipped: 'shipping_notification_status',
      };
      const column = Object.prototype.hasOwnProperty.call(tagToColumn, emailTypeTag)
        ? tagToColumn[emailTypeTag]
        : 'confirmation_email_status';

      if (column) {
        try {
          // neon's tagged-template binding does not support dynamic column
          // names, so we route to a fixed UPDATE per column. This keeps the
          // query parameterised and avoids any SQL injection risk.
          if (column === 'confirmation_email_status') {
            await db`
              UPDATE orders
              SET confirmation_email_status = ${newStatus}
              WHERE id = ${orderId}
            `;
          } else if (column === 'production_email_status') {
            await db`
              UPDATE orders
              SET production_email_status = ${newStatus}
              WHERE id = ${orderId}
            `;
          } else if (column === 'shipping_notification_status') {
            await db`
              UPDATE orders
              SET shipping_notification_status = ${newStatus}
              WHERE id = ${orderId}
            `;
          }
        } catch (colErr) {
          // The new status columns may not exist yet on legacy databases;
          // log and continue so we still record the email_events row.
          console.warn(`webhook: failed to update orders.${column} for ${orderId}:`, colErr.message);
        }
      }
    }

    console.log('webhook update', {
      providerMsgId,
      newStatus,
      orderId,
      emailTypeTag,
      rowCount: result.count || result.rowCount,
      eventType: evt.type
    });
  } else {
    console.log('webhook received but not processed', {
      eventType: evt.type,
      providerMsgId,
      hasStatus: !!newStatus
    });
  }

  return { statusCode: 200, body: 'ok' };
};
