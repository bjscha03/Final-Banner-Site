const { neon } = require('@neondatabase/serverless');
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

// Send email using Resend
async function sendProductionEmail(order, customerEmail) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const emailFrom = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

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

    const emailData = {
      from: emailFrom,
      to: customerEmail,
      subject: 'Your Order is Now in Production 🎯',
      html: html,
      reply_to: emailReplyTo,
      tags: [
        { name: 'type', value: 'order_in_production' },
        { name: 'order_id', value: order.id }
      ]
    };

    const result = await resend.emails.send(emailData);
    if (result.error) {
      throw result.error;
    }
    return { ok: true, id: result.data?.id };

  } catch (error) {
    console.error('Email send failed:', error);
    return { ok: false, error: error.message };
  }
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

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

    // AUTO-MIGRATE: Ensure the status constraint includes 'in_production' and tracking columns exist
    try {
      await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check`;
      await sql`ALTER TABLE orders ADD CONSTRAINT orders_status_check
        CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'shipped', 'in_production'))`;
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS production_email_sent BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS production_email_sent_at TIMESTAMP WITH TIME ZONE
      `;
      console.log('[mark-in-production] Auto-migration: constraint and columns verified');
    } catch (migErr) {
      console.warn('[mark-in-production] Auto-migration warning (non-fatal):', migErr.message);
    }

    const { orderId } = JSON.parse(event.body || '{}');

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

    // Prevent duplicate sends (also check status in case column doesn't exist yet)
    if (order.production_email_sent || order.status === 'in_production') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order is already in production' })
      };
    }

    // Get customer email (from user profile or order)
    const customerEmail = order.user_email || order.email;
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

    // Update order status to in_production regardless of email outcome
    // Try with production_email columns first; fall back to status-only if columns don't exist yet
    let dbUpdated = false;
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
    } catch (updateError) {
      // If the production_email columns don't exist yet (migration not run), update status only
      console.warn('Full update failed, trying status-only update:', updateError.message);
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

    console.log(`Order ${orderId} marked as in production. Email ${emailResult.ok ? 'sent' : 'failed'} to ${customerEmail}. DB updated: ${dbUpdated}`);

    // Return success if email was sent, even if DB update failed
    // The admin UI will update local state and show the correct status
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: emailResult.ok
          ? 'Order marked as in production and customer notified'
          : 'Order marked as in production (email delivery failed)',
        emailSent: emailResult.ok,
        dbUpdated: dbUpdated,
        emailError: emailResult.ok ? undefined : emailResult.error,
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
        details: error.message
      })
    };
  }
};
