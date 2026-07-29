const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../server-auth.cjs');
const { getItemDisplayName, getEmailItemOptions, normalizeOrderItemDisplay } = require('./product-display-helpers.cjs');
const {
  normalizeName,
  getFinalizedThumbnailUrl,
  renderItems,
  renderTotals,
  renderAddress,
  renderEmailLayout,
  escapeHtml,
} = require('./email-template.cjs');
const { normalizeTrackingEntries, getTrackingUrl } = require('./tracking-helpers.cjs');

function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

function normalizeEmailError(error) {
  if (!error) return 'Email send failed';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  try { return JSON.stringify(error); } catch { return String(error); }
}

function getEmailErrorStatus(error) {
  const value = Number(error?.statusCode ?? error?.status ?? error?.code);
  return Number.isFinite(value) ? value : null;
}

function isRetryableEmailError(error) {
  const status = getEmailErrorStatus(error);
  const message = normalizeEmailError(error).toLowerCase();
  return status === 429
    || (status !== null && status >= 500 && status < 600)
    || message.includes('too many requests')
    || message.includes('rate limit')
    || message.includes('temporarily unavailable');
}

async function sendEmailWithRetry(resend, emailData, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await resend.emails.send(emailData);
      if (result?.error) {
        const apiError = new Error(normalizeEmailError(result.error));
        apiError.statusCode = getEmailErrorStatus(result.error);
        apiError.details = result.error;
        throw apiError;
      }
      if (!result?.data?.id) throw new Error('Resend accepted no message ID');
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableEmailError(error) || attempt === maxAttempts) throw error;
      const delayMs = attempt === 1 ? 1000 : 3000;
      console.warn('[tracking-email] transient provider failure; retrying', {
        attempt,
        delayMs,
        error: normalizeEmailError(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error('Email send failed');
}

async function logEmailAttempt({ type, to, orderId, status, providerMsgId, errorMessage, trackingNumber, adminUser }) {
  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) return;
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO email_events (type, to_email, order_id, status, provider_msg_id, error_message, created_at)
      VALUES (${type}, ${to}, ${orderId}, ${status}, ${providerMsgId || null}, ${errorMessage || null}, NOW())
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tracking_email_audit (
        id BIGSERIAL PRIMARY KEY,
        order_id UUID,
        admin_user TEXT,
        tracking_number TEXT,
        status TEXT NOT NULL,
        provider_msg_id TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      INSERT INTO tracking_email_audit (order_id, admin_user, tracking_number, status, provider_msg_id, error_message, created_at)
      VALUES (${orderId}, ${adminUser || null}, ${trackingNumber || null}, ${status}, ${providerMsgId || null}, ${errorMessage || null}, NOW())
    `;
  } catch (error) {
    console.error('[tracking-email] failed to write email audit', normalizeEmailError(error));
  }
}

function buildShippingEmailData(order, trackingNumbers, emailFrom, emailReplyTo) {
  const names = normalizeName(order.customerName || order.shipping_name || '');
  const entries = normalizeTrackingEntries(trackingNumbers);
  const multiple = entries.length > 1;
  const trackingHtml = entries.map((entry, index) => `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px;">
        <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(entry.label || `Package ${index + 1}`)}</p>
        <p style="margin:0 0 6px;color:#334155;font-size:13px;">FedEx Tracking: <span style="font-family:monospace;font-weight:700;color:#0f172a;">${escapeHtml(entry.trackingNumber)}</span></p>
        <a href="${escapeHtml(getTrackingUrl(entry))}" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:13px;">Track Package</a>
      </td></tr>
    </table>`).join('');

  const html = renderEmailLayout({
    title: 'Your Order Has Shipped',
    subtitle: multiple ? 'Your order was sent in multiple packages.' : 'Your order has shipped.',
    orderNumber: order.orderNumber,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;color:#334155;">Hi ${escapeHtml(names.firstName)},</p>
      <p style="margin:0 0 14px;font-size:14px;color:#334155;">${multiple ? 'Your order was sent in multiple packages.' : 'Your order has shipped.'}</p>
      ${trackingHtml}
      ${renderItems(order.items || [])}
      ${renderTotals({ subtotal: order.subtotal, tax: order.tax, total: order.total, discountCents: order.discountCents, discountLabel: order.discountLabel })}
      ${renderAddress(order)}
    `,
  });

  return {
    from: emailFrom,
    to: order.email,
    subject: `Your Order #${order.orderNumber} Has Shipped!`,
    html,
    replyTo: emailReplyTo,
    tags: [
      { name: 'type', value: 'order_shipped' },
      { name: 'order_id', value: String(order.id) },
    ],
  };
}

async function sendShippingEmail(order, trackingNumbers) {
  try {
    const { Resend } = require('resend');
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };
    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailFromRaw = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'orders@bannersonthefly.com';
    const emailFrom = emailFromRaw.includes('<') ? emailFromRaw : `Banners on the Fly <${emailFromRaw}>`;
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
    const emailData = buildShippingEmailData(order, trackingNumbers, emailFrom, emailReplyTo);
    const result = await sendEmailWithRetry(resend, emailData);
    return { ok: true, id: result.data.id };
  } catch (error) {
    const message = normalizeEmailError(error);
    console.error('[tracking-email] send failed', {
      orderId: order?.id,
      to: order?.email,
      error: message,
      status: getEmailErrorStatus(error),
      details: error?.details || null,
    });
    return { ok: false, error: message };
  }
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database configuration missing' }) };
    const sql = neon(dbUrl);
    const { orderId } = JSON.parse(event.body || '{}');
    const adminUser = event.headers['x-admin-user'] || event.headers['x-admin-email'] || event.headers['x-nf-client-connection-ip'] || null;
    if (!orderId || typeof orderId !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Order ID is required' }) };
    }

    const orderRows = await sql`
      SELECT o.*, p.email AS user_email, p.full_name
      FROM orders o
      LEFT JOIN profiles p ON o.user_id = p.id
      WHERE o.id = ${orderId}
    `;
    if (!orderRows.length) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };

    const order = orderRows[0];
    const trackingNumbers = normalizeTrackingEntries(order);
    if (!trackingNumbers.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Add at least one tracking number before sending the tracking email.' }) };
    }

    // Checkout email is authoritative. Profile email is only a legacy fallback.
    const customerEmail = order.email || order.user_email;
    if (!customerEmail) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Customer email not found' }) };
    const customerName = order.customer_name || order.full_name || order.shipping_name || '';
    const itemRows = await sql`SELECT * FROM order_items WHERE order_id = ${orderId} ORDER BY created_at`;
    const itemSubtotalCents = itemRows.reduce((sum, item) => sum + Number(item.line_total_cents || 0), 0);
    const subtotalCents = Number(order.subtotal_cents) || itemSubtotalCents;
    const discountCents = Number(order.applied_discount_cents) || 0;
    const taxCents = Number(order.tax_cents) || Math.round(Math.max(0, subtotalCents - discountCents) * 0.06);
    const totalCents = Number(order.total_cents) || Math.max(0, subtotalCents - discountCents) + taxCents;

    const emailOrder = {
      id: order.id,
      orderNumber: order.id.slice(-8).toUpperCase(),
      customerName,
      email: customerEmail,
      items: itemRows.map((item) => ({
        ...normalizeOrderItemDisplay(item),
        name: getItemDisplayName(item),
        quantity: item.quantity,
        price: Number(item.line_total_cents || 0) / 100,
        lineTotal: Number(item.line_total_cents || 0) / 100,
        unitPrice: Number(item.quantity) > 0 ? (Number(item.line_total_cents || 0) / 100) / Number(item.quantity) : 0,
        options: getEmailItemOptions(item),
        product_type: item.product_type || 'banner',
        thumbnailUrl: getFinalizedThumbnailUrl(item, 220),
      })),
      subtotal: subtotalCents / 100,
      tax: taxCents / 100,
      total: totalCents / 100,
      discountCents,
      discountLabel: order.applied_discount_label || '',
      shipping_name: order.shipping_name,
      shipping_street: order.shipping_street,
      shipping_street2: order.shipping_street2,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
      shipping_country: order.shipping_country,
      shippingAddress: {
        name: order.shipping_name || customerName,
        line1: order.shipping_street || '',
        line2: order.shipping_street2 || '',
        city: order.shipping_city || '',
        state: order.shipping_state || '',
        postalCode: order.shipping_zip || '',
        country: order.shipping_country || 'US',
      },
    };

    const wasResend = Boolean(order.shipping_notification_sent);
    const emailResult = await sendShippingEmail(emailOrder, trackingNumbers);
    await logEmailAttempt({
      type: 'order.shipped',
      to: customerEmail,
      orderId: order.id,
      status: emailResult.ok ? 'sent' : 'error',
      providerMsgId: emailResult.ok ? emailResult.id : null,
      errorMessage: emailResult.ok ? null : emailResult.error,
      trackingNumber: trackingNumbers.map((entry) => entry.trackingNumber).join(', '),
      adminUser,
    });

    if (!emailResult.ok) {
      await sql`
        UPDATE orders
        SET shipping_notification_sent = false,
            shipping_notification_status = 'error',
            updated_at = NOW()
        WHERE id = ${orderId}
      `;
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ ok: false, error: emailResult.error || 'Failed to send tracking email' }),
      };
    }

    await sql`
      UPDATE orders
      SET status = 'shipped',
          shipping_notification_sent = true,
          shipping_notification_sent_at = NOW(),
          shipping_notification_status = 'sent',
          updated_at = NOW()
      WHERE id = ${orderId}
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: wasResend ? 'Tracking email resent successfully' : 'Tracking email sent successfully',
        wasResend,
        emailId: emailResult.id,
        sentAt: new Date().toISOString(),
        trackingNumber: trackingNumbers.map((entry) => entry.trackingNumber).join(', '),
      }),
    };
  } catch (error) {
    const message = normalizeEmailError(error);
    console.error('[tracking-email] handler failed', message);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: message }) };
  }
};

exports._test = {
  normalizeEmailError,
  isRetryableEmailError,
  buildShippingEmailData,
};
