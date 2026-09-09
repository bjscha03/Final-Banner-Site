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

// Neon database connection
function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}
const TAX_RATE = 0.06;

function normalizeEmailError(error) {
  if (!error) return 'Email send failed';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
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
      if (!result?.data?.id) {
        throw new Error('Resend accepted no message ID');
      }
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableEmailError(error) || attempt === maxAttempts) throw error;
      const delayMs = attempt === 1 ? 1000 : 3000;
      console.warn('[mark-in-production] transient email failure; retrying', {
        attempt,
        delayMs,
        error: normalizeEmailError(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Email send failed');
}

// Email logging function
async function logEmailAttempt({ type, to, orderId, status, providerMsgId, errorMessage }) {
  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) return;

    const sql = neon(dbUrl);
    await sql`
      INSERT INTO email_events (type, to_email, order_id, status, provider_msg_id, error_message, created_at)
      VALUES (${type}, ${to}, ${orderId}, ${status}, ${providerMsgId || null}, ${errorMessage || null}, NOW())
    `;
  } catch (error) {
    console.error('Failed to log email attempt:', error);
  }
}

function buildProductionEmailData(order, customerEmail, emailFrom, emailReplyTo) {
  const names = normalizeName(order.customerName || '');
  const html = renderEmailLayout({
    title: 'Your Order is Now in Production',
    subtitle: 'Good news — your order is now in production.',
    orderNumber: order.orderNumber,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;color:#334155;">Hi ${escapeHtml(names.firstName)},</p>
      <p style="margin:0 0 12px;font-size:14px;color:#334155;">Our team is currently working on your order. Once it is complete, we will send your tracking details right away.</p>
      ${renderItems(order.items || [])}
      ${renderTotals({ subtotal: order.subtotal, tax: order.tax, total: order.total, discountCents: order.discountCents, discountLabel: order.discountLabel })}
      ${renderAddress(order)}
    `,
  });

  return {
    from: emailFrom,
    to: customerEmail,
    subject: `Your Order #${order.orderNumber} is Now in Production 🎯`,
    html,
    // Resend's Node SDK uses camelCase `replyTo`. The prior snake_case key was
    // not part of SendEmailOptions and caused this notification to be rejected.
    replyTo: emailReplyTo,
    tags: [
      { name: 'type', value: 'order_in_production' },
      { name: 'order_id', value: String(order.id) },
    ],
  };
}

// Send email using Resend
async function sendProductionEmail(order, customerEmail) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailFromRaw = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'orders@bannersonthefly.com';
    const emailFrom = emailFromRaw.includes('<') ? emailFromRaw : `Banners on the Fly <${emailFromRaw}>`;
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
    const emailData = buildProductionEmailData(order, customerEmail, emailFrom, emailReplyTo);

    const result = await sendEmailWithRetry(resend, emailData);
    return { ok: true, id: result.data.id };
  } catch (error) {
    const message = normalizeEmailError(error);
    console.error('[mark-in-production] email send failed', {
      to: customerEmail,
      orderId: order?.id,
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
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database configuration missing' })
      };
    }

    const sql = neon(dbUrl);

    // Do not run schema DDL from an Admin button click. ALTER TABLE requires an
    // ACCESS EXCLUSIVE lock and can make this synchronous action time out while
    // normal order traffic is active. The production schema is managed by the
    // database migration path and is verified separately from this request.
    const { orderId, retryEmail = false } = JSON.parse(event.body || '{}');

    if (!orderId || typeof orderId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }

    // Get order details
    const orderResult = await sql`
      SELECT o.*, p.email as user_email, p.full_name
      FROM orders o
      LEFT JOIN profiles p ON o.user_id = p.id
      WHERE o.id = ${orderId}
    `;

    if (orderResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    const order = orderResult[0];

    // Prevent duplicate sends unless this is an explicit admin retry of a
    // failed delivery (suppression cleared, bounce reason resolved, etc.).
    const isFailedStatus = ['error', 'bounced', 'complained'].includes(order.production_email_status);
    const allowRetry = retryEmail === true && isFailedStatus;
    if (!allowRetry && (order.production_email_sent || order.status === 'in_production')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order is already in production' })
      };
    }

    // The email captured on the order is the authoritative checkout contact.
    // Profile email is only a fallback for older registered-customer orders.
    const customerEmail = order.email || order.user_email;
    if (!customerEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Customer email not found' })
      };
    }

    // Get customer name
    const resolvedCustomerName = order.customer_name || order.full_name || order.shipping_name || '';

    // Get order items
    const itemsResult = await sql`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;
    const subtotalCents = itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
    const discountCents = order.applied_discount_cents || 0;
    const afterDiscountCents = subtotalCents - discountCents;
    const taxCents = Math.round(afterDiscountCents * TAX_RATE);
    const totalCents = afterDiscountCents + taxCents;

    // Format order data for email
    const emailOrder = {
      id: order.id,
      orderNumber: order.id.slice(-8).toUpperCase(),
      customerName: resolvedCustomerName,
      email: customerEmail,
      items: itemsResult.map(item => ({
        ...normalizeOrderItemDisplay(item),
        name: getItemDisplayName(item),
        quantity: item.quantity,
        options: getEmailItemOptions(item),
        product_type: item.product_type || 'banner',
        price: item.line_total_cents / 100,
        lineTotal: item.line_total_cents / 100,
        unitPrice: item.quantity > 0 ? (item.line_total_cents / 100) / item.quantity : 0,
        thumbnailUrl: getFinalizedThumbnailUrl(item, 220),
      })),
      subtotal: subtotalCents / 100,
      tax: taxCents / 100,
      total: totalCents / 100,
      discountCents: discountCents,
      discountLabel: order.applied_discount_label || '',
      shipping_name: order.shipping_name,
      shipping_street: order.shipping_street,
      shipping_street2: order.shipping_street2,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
      shipping_country: order.shipping_country,
      shippingAddress: {
        name: order.shipping_name || resolvedCustomerName || '',
        line1: order.shipping_street || '',
        line2: order.shipping_street2 || '',
        city: order.shipping_city || '',
        state: order.shipping_state || '',
        postalCode: order.shipping_zip || '',
        country: order.shipping_country || 'US',
      },
    };

    // Send production notification email
    const emailResult = await sendProductionEmail(emailOrder, customerEmail);

    // Log email attempt
    await logEmailAttempt({
      type: 'order.in_production',
      to: customerEmail,
      orderId: order.id,
      status: emailResult.ok ? 'sent' : 'error',
      providerMsgId: emailResult.ok ? emailResult.id : undefined,
      errorMessage: emailResult.ok ? undefined : emailResult.error
    });

    if (!emailResult.ok) {
      console.error(`Failed to send production email for order ${orderId}:`, emailResult.error);
    }

    // Update order status to in_production regardless of email outcome.
    let dbUpdated = false;
    try {
      await sql`
        UPDATE orders
        SET status = 'in_production',
            production_email_sent = ${emailResult.ok},
            production_email_sent_at = ${emailResult.ok ? new Date().toISOString() : null},
            production_email_status = ${emailResult.ok ? 'sent' : 'error'},
            updated_at = NOW()
        WHERE id = ${orderId}
      `;
      dbUpdated = true;
    } catch (updateError) {
      console.warn('Full update with status failed, retrying without production_email_status:', updateError.message);
      try {
        await sql`
          UPDATE orders
          SET status = 'in_production',
              production_email_sent = ${emailResult.ok},
              production_email_sent_at = ${emailResult.ok ? new Date().toISOString() : null},
              updated_at = NOW()
          WHERE id = ${orderId}
        `;
        dbUpdated = true;
      } catch (legacyError) {
        console.warn('Status+sent update failed, trying status-only update:', legacyError.message);
        try {
          await sql`
            UPDATE orders
            SET status = 'in_production',
                updated_at = NOW()
            WHERE id = ${orderId}
          `;
          dbUpdated = true;
        } catch (fallbackError) {
          console.error('Status-only update also failed:', fallbackError.message);
        }
      }
    }

    console.log(`Order ${orderId} marked as in production. Email ${emailResult.ok ? 'sent' : 'failed'} to ${customerEmail}. DB updated: ${dbUpdated}`);

    // Initial status changes remain successful even if the email provider fails.
    // An explicit retry is an email-only operation, so surface a provider failure
    // as a failed HTTP response instead of falsely showing "Email resent".
    const retryFailed = retryEmail === true && !emailResult.ok;
    return {
      statusCode: retryFailed ? 502 : 200,
      headers,
      body: JSON.stringify({
        ok: retryFailed ? false : true,
        message: emailResult.ok
          ? 'Order marked as in production and customer notified'
          : 'Order marked as in production (email delivery failed)',
        emailSent: emailResult.ok,
        dbUpdated,
        emailError: emailResult.ok ? undefined : emailResult.error,
        error: retryFailed ? emailResult.error : undefined,
        emailId: emailResult.id
      })
    };
  } catch (error) {
    console.error('Mark in production failed:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        details: normalizeEmailError(error)
      })
    };
  }
};

exports._test = {
  buildProductionEmailData,
  normalizeEmailError,
  isRetryableEmailError,
};
