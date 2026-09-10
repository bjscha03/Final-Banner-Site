'use strict';

const { Resend } = require('resend');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class RefundEmailError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'RefundEmailError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function orderNumber(orderId) {
  return String(orderId || '').slice(-8).toUpperCase();
}

function formatUsd(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((Number(cents) || 0) / 100);
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || 'there';
}

function createRefundEmailData(order, env = process.env) {
  const number = orderNumber(order.id);
  const amount = formatUsd(order.total_cents);
  const customerFirstName = firstName(order.customer_name || order.shipping_name);
  const fromRaw = env.EMAIL_FROM || env.FROM_EMAIL || 'orders@bannersonthefly.com';
  const from = fromRaw.includes('<') ? fromRaw : `Banners On The Fly <${fromRaw}>`;
  const replyTo = env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
  const subject = `Your Banners On The Fly order #${number} has been refunded`;
  const previewText = `Your refund of ${amount} for order #${number} has been issued.`;

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr><td style="background:#0b1f3a;padding:24px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.4px;">Banners On The Fly</div>
          </td></tr>
          <tr><td style="padding:32px 28px;">
            <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;color:#0f172a;">Your refund has been issued</h1>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#334155;">Hi ${escapeHtml(customerFirstName)},</p>
            <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#334155;">Your Banners On The Fly order has been cancelled, and a refund has been issued to your original payment method.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
              <tr><td style="padding:16px 18px;font-size:15px;color:#475569;">Order</td><td align="right" style="padding:16px 18px;font-size:15px;font-weight:700;color:#0f172a;">#${escapeHtml(number)}</td></tr>
              <tr><td style="padding:0 18px 16px;font-size:15px;color:#475569;">Refund amount</td><td align="right" style="padding:0 18px 16px;font-size:18px;font-weight:800;color:#15803d;">${escapeHtml(amount)}</td></tr>
            </table>
            <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#475569;">The refund will be returned to the payment method used for the order. Depending on your bank or card provider, it may take several business days to appear on your statement.</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">If you have any questions, reply to this email or contact <a href="mailto:${escapeHtml(replyTo)}" style="color:#18448d;font-weight:700;">${escapeHtml(replyTo)}</a>.</p>
          </td></tr>
          <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 28px;text-align:center;font-size:12px;color:#64748b;">Banners On The Fly · Nationwide custom printing</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${customerFirstName},`,
    '',
    'Your Banners On The Fly order has been cancelled, and a refund has been issued to your original payment method.',
    '',
    `Order: #${number}`,
    `Refund amount: ${amount}`,
    '',
    'Depending on your bank or card provider, it may take several business days to appear on your statement.',
    '',
    `Questions? Reply to this email or contact ${replyTo}.`,
  ].join('\n');

  return {
    from,
    to: order.email,
    replyTo,
    subject,
    html,
    text,
    tags: [
      { name: 'type', value: 'order_refund' },
      { name: 'order_id', value: String(order.id) },
    ],
  };
}

async function ensureRefundEmailSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS refund_email_history (
      order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      customer_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      resend_message_id TEXT,
      admin_identifier TEXT,
      failure_reason TEXT
    )
  `;
}

async function prepareRefundEmail(sql, orderId, env = process.env) {
  if (!env.RESEND_API_KEY) {
    throw new RefundEmailError(503, 'REFUND_EMAIL_NOT_CONFIGURED', 'Refund email delivery is not configured. The order was not changed.');
  }

  await ensureRefundEmailSchema(sql);
  const rows = await sql`
    SELECT id, email, customer_name, shipping_name, total_cents
      FROM orders
     WHERE id = ${orderId}
     LIMIT 1
  `;
  const order = rows[0];
  if (!order) throw new RefundEmailError(404, 'ORDER_NOT_FOUND', 'Order not found.');

  const email = String(order.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new RefundEmailError(422, 'CUSTOMER_EMAIL_MISSING', 'Add a valid customer email before marking this order cancelled/refunded.');
  }

  return {
    ...order,
    email,
    total_cents: Number(order.total_cents) || 0,
  };
}

function normalizeProviderError(error) {
  return String(error?.message || error || 'Email provider rejected the request')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:re_|sk_)[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]')
    .slice(0, 1000);
}

async function sendWithRetry(resend, payload, idempotencyKey, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await resend.emails.send(payload, { idempotencyKey });
      if (result?.error) {
        const providerError = new Error(String(result.error.message || result.error));
        providerError.statusCode = Number(result.error.statusCode || result.error.status) || null;
        throw providerError;
      }
      if (!result?.data?.id) throw new Error('Resend did not return a message ID');
      return result.data.id;
    } catch (error) {
      lastError = error;
      const status = Number(error?.statusCode || error?.status);
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 750 : 2000));
    }
  }
  throw lastError || new Error('Email provider rejected the request');
}

async function logEmailEvent(sql, { orderId, email, status, providerMessageId, failureReason }) {
  try {
    await sql`
      INSERT INTO email_events (type, to_email, order_id, status, provider_msg_id, error_message, created_at)
      VALUES ('order.refund', ${email}, ${orderId}, ${status}, ${providerMessageId || null}, ${failureReason || null}, NOW())
    `;
  } catch (error) {
    console.error('[refund-email] secondary email event logging failed', {
      orderId,
      status,
      error: normalizeProviderError(error),
    });
  }
}

async function sendRefundEmailOnce({ sql, order, adminIdentifier, env = process.env, resend }) {
  const attempts = await sql`
    INSERT INTO refund_email_history (
      order_id, customer_email, status, requested_at, admin_identifier, failure_reason
    )
    VALUES (${order.id}, ${order.email}, 'sending', NOW(), ${adminIdentifier || null}, NULL)
    ON CONFLICT (order_id) DO UPDATE
      SET customer_email = EXCLUDED.customer_email,
          status = 'sending',
          requested_at = NOW(),
          admin_identifier = EXCLUDED.admin_identifier,
          failure_reason = NULL
    WHERE refund_email_history.status = 'failed'
       OR (refund_email_history.status = 'sending' AND refund_email_history.requested_at < NOW() - INTERVAL '10 minutes')
    RETURNING order_id
  `;

  if (!attempts[0]) {
    const rows = await sql`
      SELECT status, sent_at, resend_message_id
        FROM refund_email_history
       WHERE order_id = ${order.id}
       LIMIT 1
    `;
    if (rows[0]?.status === 'sent') {
      return { outcome: 'already_sent', sentAt: rows[0].sent_at, messageId: rows[0].resend_message_id };
    }
    throw new RefundEmailError(409, 'REFUND_EMAIL_IN_PROGRESS', 'The refund email is already being sent. Please wait before trying again.');
  }

  const transport = resend || new Resend(env.RESEND_API_KEY);
  try {
    const messageId = await sendWithRetry(
      transport,
      createRefundEmailData(order, env),
      `bof-order-email/order.refund/${order.id}`.slice(0, 256),
    );
    const sentRows = await sql`
      UPDATE refund_email_history
         SET status = 'sent', sent_at = NOW(), resend_message_id = ${messageId}, failure_reason = NULL
       WHERE order_id = ${order.id} AND status = 'sending'
      RETURNING sent_at
    `;
    await logEmailEvent(sql, {
      orderId: order.id,
      email: order.email,
      status: 'sent',
      providerMessageId: messageId,
      failureReason: null,
    });
    return { outcome: 'sent', sentAt: sentRows[0]?.sent_at || null, messageId };
  } catch (error) {
    const failureReason = normalizeProviderError(error);
    await sql`
      UPDATE refund_email_history
         SET status = 'failed', failure_reason = ${failureReason}
       WHERE order_id = ${order.id} AND status = 'sending'
    `;
    await logEmailEvent(sql, {
      orderId: order.id,
      email: order.email,
      status: 'failed',
      providerMessageId: null,
      failureReason,
    });
    throw new RefundEmailError(502, 'REFUND_EMAIL_FAILED', 'The order was marked cancelled/refunded, but the customer email could not be sent. Please try the action again.');
  }
}

module.exports = {
  EMAIL_PATTERN,
  RefundEmailError,
  createRefundEmailData,
  ensureRefundEmailSchema,
  prepareRefundEmail,
  sendRefundEmailOnce,
};
