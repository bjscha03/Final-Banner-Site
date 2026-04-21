const { neon } = require('@neondatabase/serverless');
const { getItemDisplayName, getEmailItemOptions } = require('./product-display-helpers.cjs');
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

// Email logging function
async function logEmailAttempt({ type, to, orderId, status, providerMsgId, errorMessage }) {
  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) return;

    const sql = neon(dbUrl);
    await sql`
      INSERT INTO email_events (type, to_email, order_id, status, provider_msg_id, error_message, created_at)
      VALUES (${type}, ${to}, ${orderId}, ${status}, ${providerMsgId}, ${errorMessage}, NOW())
    `;
  } catch (error) {
    console.error('Failed to log email attempt:', error);
  }
}

// Send email using Resend
async function sendEmail(type, payload) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailFrom = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    // For now, we'll use a simple HTML template since importing React components in Netlify functions is complex
    // In production, you'd want to use the actual OrderShipped React component
    const createShippingEmailHtml = (order, trackingNumber, trackingUrl) => {
      const names = normalizeName(order.customerName || '');
      return renderEmailLayout({
        title: 'Your Order Has Shipped',
        subtitle: 'Your order has shipped.',
        orderNumber: order.orderNumber,
        bodyHtml: `
          <p style="margin:0 0 12px;font-size:15px;color:#334155;">Hi ${escapeHtml(names.firstName)},</p>
          <p style="margin:0 0 14px;font-size:14px;color:#334155;">Your order has shipped.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr><td style="padding:14px;">
              <p style="margin:0 0 6px;color:#334155;font-size:13px;">Carrier: FedEx</p>
              <p style="margin:0 0 10px;color:#0f172a;font-size:14px;font-weight:700;font-family:monospace;">Tracking #: ${escapeHtml(trackingNumber || '')}</p>
              ${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:13px;">Track Your Package</a>` : ''}
            </td></tr>
          </table>
          ${renderItems(order.items || [])}
          ${renderTotals({ subtotal: order.subtotal, tax: order.tax, total: order.total, discountCents: order.discountCents, discountLabel: order.discountLabel })}
          ${renderAddress(order)}
        `,
      });
    };

    if (type === 'order.shipped') {
      const { order, trackingNumber, trackingUrl } = payload;
      
      const emailData = {
        from: emailFrom,
        to: order.email,
        subject: `Your Order #${order.orderNumber} Has Shipped!`,
        html: createShippingEmailHtml(order, trackingNumber, trackingUrl),
        reply_to: emailReplyTo,
        tags: [
          { name: 'type', value: 'order_shipped' },
          { name: 'order_id', value: order.id }
        ]
      };

      const result = await resend.emails.send(emailData);
      return { ok: true, id: result.data?.id };
    }

    return { ok: false, error: `Unknown email type: ${type}` };

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

exports.handler = async (event, context) => {
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
        body: JSON.stringify({
          ok: false,
          error: 'Database configuration missing'
        })
      };
    }

    const sql = neon(dbUrl);
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

    // Check if order has tracking number
    if (!order.tracking_number) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order must have tracking number before sending notification' })
      };
    }

    // Get customer email (from user or order)
    const customerEmail = order.user_email || order.email;
    if (!customerEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Customer email not found' })
      };
    }

    // Get customer name - title-case it
    const resolvedCustomerName = order.customer_name || order.full_name || order.shipping_name || '';

    // Get order items
    const itemsResult = await sql`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;

    // Format order data for email - provide both formats for compatibility
    const emailOrder = {
      id: order.id,
      orderNumber: order.id.slice(-8).toUpperCase(),
      customerName: resolvedCustomerName,
      email: customerEmail,
      items: itemsResult.map(item => ({
        name: getItemDisplayName(item),
        quantity: item.quantity,
        price: item.line_total_cents / 100,
        lineTotal: item.line_total_cents / 100,
        unitPrice: item.quantity > 0 ? (item.line_total_cents / 100) / item.quantity : 0,
        options: getEmailItemOptions(item),
        material: item.material,
        polePocketPosition: item.pole_pocket_position || item.pole_pockets,
        polePocketSize: item.pole_pocket_size,
        product_type: item.product_type || 'banner',
        thumbnailUrl: getFinalizedThumbnailUrl(item, 220),
      })),
      // FIX: Calculate correct subtotal, tax, and total from line_total_cents
      // Database values may be incorrect, so recalculate from item totals
      get subtotal() {
        const calculatedSubtotal = itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
        return calculatedSubtotal / 100;
      },
      get tax() {
        const calculatedSubtotal = itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
        const discount = order.applied_discount_cents || 0;
        const calculatedTax = Math.round((calculatedSubtotal - discount) * 0.06);
        return calculatedTax / 100;
      },
      get total() {
        const calculatedSubtotal = itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
        const discount = order.applied_discount_cents || 0;
        const afterDiscount = calculatedSubtotal - discount;
        const calculatedTax = Math.round(afterDiscount * 0.06);
        const calculatedTotal = afterDiscount + calculatedTax;
        return calculatedTotal / 100;
      },
      get subtotalCents() {
        return itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
      },
      get taxCents() {
        const calculatedSubtotal = itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
        const discount = order.applied_discount_cents || 0;
        return Math.round((calculatedSubtotal - discount) * 0.06);
      },
      get totalCents() {
        const calculatedSubtotal = itemsResult.reduce((sum, item) => sum + item.line_total_cents, 0);
        const discount = order.applied_discount_cents || 0;
        const afterDiscount = calculatedSubtotal - discount;
        const calculatedTax = Math.round(afterDiscount * 0.06);
        return afterDiscount + calculatedTax;
      },
      discountCents: order.applied_discount_cents || 0,
      discountLabel: order.applied_discount_label || '',
      shipping_name: order.shipping_name,
      shipping_street: order.shipping_street,
      shipping_street2: order.shipping_street2,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
      shipping_country: order.shipping_country,
    };

    // Create tracking URL (FedEx)
    const trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${order.tracking_number}`;

    // Send shipping notification email
    const emailResult = await sendEmail('order.shipped', {
      order: emailOrder,
      trackingNumber: order.tracking_number,
      trackingUrl: trackingUrl
    });

    // Log email attempt
    await logEmailAttempt({
      type: 'order.shipped',
      to: customerEmail,
      orderId: order.id,
      status: emailResult.ok ? 'sent' : 'error',
      providerMsgId: emailResult.ok ? emailResult.id : undefined,
      errorMessage: emailResult.ok ? undefined : emailResult.error
    });

    if (!emailResult.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Failed to send email',
          details: emailResult.error
        })
      };
    }

    // Update order status to shipped if not already
    if (order.status !== 'shipped') {
      await sql`
        UPDATE orders
        SET status = 'shipped', updated_at = NOW()
        WHERE id = ${orderId}
      `;
    }

    // Mark that shipping notification was sent
    await sql`
      UPDATE orders
      SET shipping_notification_sent = true, shipping_notification_sent_at = NOW()
      WHERE id = ${orderId}
    `;

    console.log(`Shipping notification sent for order ${orderId} to ${customerEmail}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true,
        message: 'Shipping notification sent successfully',
        emailId: emailResult.id
      })
    };

  } catch (error) {
    console.error('Send shipping notification failed:', error);
    
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
