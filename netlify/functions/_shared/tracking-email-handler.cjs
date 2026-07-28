const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { requireAdmin } = require('./server-auth.cjs');
const {
  getItemDisplayName,
  getEmailItemOptions,
  normalizeOrderItemDisplay,
} = require('./legacy/product-display-helpers.cjs');
const {
  normalizeName,
  getFinalizedThumbnailUrl,
  renderItems,
  renderTotals,
  renderAddress,
  renderEmailLayout,
  escapeHtml,
} = require('./legacy/email-template.cjs');
const {
  normalizeTrackingEntries,
  getTrackingUrl,
} = require('./legacy/tracking-helpers.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

function providerErrorMessage(error) {
  if (!error) return 'Resend rejected the tracking email';
  if (typeof error === 'string') return error;
  return error.message || error.name || JSON.stringify(error);
}

function isRetryableProviderError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const message = providerErrorMessage(error).toLowerCase();
  return statusCode === 429 || statusCode >= 500 || message.includes('too many requests') || message.includes('rate limit');
}

async function sendWithRetry(resend, payload, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await resend.emails.send(payload);
    if (!result?.error && result?.data?.id) return result;

    lastError = result?.error || new Error('Resend did not return a message ID');
    if (!isRetryableProviderError(lastError) || attempt === maxAttempts) break;
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 750 : 2000));
  }
  throw lastError || new Error('Tracking email failed');
}

async function logAttempt(sql, { orderId, to, status, providerId, errorMessage, trackingNumbers }) {
  try {
    await sql`
      INSERT INTO email_events (type, to_email, order_id, status, provider_msg_id, error_message, created_at)
      VALUES ('order.shipped', ${to}, ${orderId}, ${status}, ${providerId || null}, ${errorMessage || null}, NOW())
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
      INSERT INTO tracking_email_audit (order_id, tracking_number, status, provider_msg_id, error_message, created_at)
      VALUES (${orderId}, ${trackingNumbers.join(', ')}, ${status}, ${providerId || null}, ${errorMessage || null}, NOW())
    `;
  } catch (error) {
    console.error('[tracking-email] audit logging failed', error);
  }
}

function buildTrackingHtml(order, trackingNumbers) {
  const names = normalizeName(order.customerName || '');
  const trackingHtml = trackingNumbers.map((entry, index) => `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px;">
        <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(entry.label || `Package ${index + 1}`)}</p>
        <p style="margin:0 0 8px;color:#334155;font-size:13px;">FedEx Tracking: <span style="font-family:monospace;font-weight:700;color:#0f172a;">${escapeHtml(entry.trackingNumber)}</span></p>
        <a href="${escapeHtml(getTrackingUrl(entry))}" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:13px;">Track Package</a>
      </td></tr>
    </table>
  `).join('');

  return renderEmailLayout({
    title: 'Your Order Has Shipped',
    subtitle: trackingNumbers.length > 1 ? 'Your order was sent in multiple packages.' : 'Your order has shipped.',
    orderNumber: order.orderNumber,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;color:#334155;">Hi ${escapeHtml(names.firstName)},</p>
      <p style="margin:0 0 14px;font-size:14px;color:#334155;">${trackingNumbers.length > 1 ? 'Your order was sent in multiple packages. Tracking details for each package are below.' : 'Your order has shipped. Your tracking details are below.'}</p>
      ${trackingHtml}
      ${renderItems(order.items || [])}
      ${renderTotals({
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        discountCents: order.discountCents,
        discountLabel: order.discountLabel,
        sameDayFeeCents: order.sameDayFeeCents,
        saturdayFeeCents: order.saturdayFeeCents,
      })}
      ${renderAddress(order)}
    `,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  try {
    const { orderId } = JSON.parse(event.body || '{}');
    if (!orderId || typeof orderId !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Order ID is required' }) };
    }

    const dbUrl = getDbUrl();
    if (!dbUrl) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database configuration missing' }) };
    }
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'RESEND_API_KEY not configured' }) };
    }

    const sql = neon(dbUrl);
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS shipping_notification_sent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS shipping_notification_sent_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS shipping_notification_status TEXT DEFAULT 'pending'
    `;

    const orders = await sql`
      SELECT o.*, p.email AS profile_email, p.full_name
        FROM orders o
        LEFT JOIN profiles p ON o.user_id = p.id
       WHERE o.id = ${orderId}
       LIMIT 1
    `;
    if (!orders.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };
    }

    const order = orders[0];
    const trackingNumbers = normalizeTrackingEntries(order);
    if (!trackingNumbers.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Add at least one tracking number before sending the tracking email.' }) };
    }

    // The email deliberately entered at checkout is authoritative. A profile
    // address is only a legacy fallback for older account-based orders.
    const customerEmail = String(order.email || order.profile_email || '').trim().toLowerCase();
    if (!customerEmail) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Customer email not found' }) };
    }

    const items = await sql`SELECT * FROM order_items WHERE order_id = ${orderId} ORDER BY created_at`;
    const customerName = order.customer_name || order.shipping_name || order.full_name || '';
    const emailOrder = {
      id: order.id,
      orderNumber: order.id.slice(-8).toUpperCase(),
      customerName,
      email: customerEmail,
      items: items.map((item) => ({
        ...normalizeOrderItemDisplay(item),
        name: getItemDisplayName(item),
        quantity: item.quantity,
        price: Number(item.line_total_cents || 0) / 100,
        lineTotal: Number(item.line_total_cents || 0) / 100,
        unitPrice: Number(item.quantity || 0) > 0 ? (Number(item.line_total_cents || 0) / 100) / Number(item.quantity) : 0,
        options: getEmailItemOptions(item),
        product_type: item.product_type || 'banner',
        thumbnailUrl: getFinalizedThumbnailUrl(item, 220),
      })),
      subtotal: Number(order.subtotal_cents || 0) / 100,
      tax: Number(order.tax_cents || 0) / 100,
      total: Number(order.total_cents || 0) / 100,
      discountCents: Number(order.applied_discount_cents || 0),
      discountLabel: order.applied_discount_label || '',
      sameDayFeeCents: Number(order.same_day_fee_cents || 0),
      saturdayFeeCents: Number(order.saturday_fee_cents || 0),
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

    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailFromRaw = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'orders@bannersonthefly.com';
    const emailFrom = emailFromRaw.includes('<') ? emailFromRaw : `Banners on the Fly <${emailFromRaw}>`;
    const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let providerId = null;
    try {
      const result = await sendWithRetry(resend, {
        from: emailFrom,
        to: customerEmail,
        replyTo,
        subject: `Your Order #${emailOrder.orderNumber} Has Shipped!`,
        html: buildTrackingHtml(emailOrder, trackingNumbers),
        tags: [
          { name: 'type', value: 'order_shipped' },
          { name: 'order_id', value: String(order.id) },
        ],
      });
      providerId = result.data.id;
    } catch (error) {
      const errorMessage = providerErrorMessage(error);
      await logAttempt(sql, {
        orderId: order.id,
        to: customerEmail,
        status: 'error',
        errorMessage,
        trackingNumbers: trackingNumbers.map((entry) => entry.trackingNumber),
      });
      await sql`
        UPDATE orders
           SET shipping_notification_sent = FALSE,
               shipping_notification_sent_at = NULL,
               shipping_notification_status = 'error',
               updated_at = NOW()
         WHERE id = ${orderId}
      `;
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ ok: false, error: errorMessage }),
      };
    }

    await logAttempt(sql, {
      orderId: order.id,
      to: customerEmail,
      status: 'sent',
      providerId,
      trackingNumbers: trackingNumbers.map((entry) => entry.trackingNumber),
    });

    await sql`
      UPDATE orders
         SET status = 'shipped',
             shipping_notification_sent = TRUE,
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
        emailId: providerId,
        sentAt: new Date().toISOString(),
        trackingNumbers,
      }),
    };
  } catch (error) {
    console.error('[tracking-email] failed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error?.message || 'Tracking email failed' }),
    };
  }
};

exports._test = { providerErrorMessage, isRetryableProviderError, buildTrackingHtml };
