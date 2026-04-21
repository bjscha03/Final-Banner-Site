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

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Send email using existing email system
async function sendEmail(type, payload) {
  try {
    const { Resend } = require('resend');
    
    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailFromRaw = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
    const emailFrom = emailFromRaw.includes('<') ? emailFromRaw : `Banners on the Fly <${emailFromRaw}>`;
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let subject, html;
    
    if (type === 'order.confirmation') {
      subject = `Order Confirmation #${payload.order.number} - Banners On The Fly`;
      const names = normalizeName(payload.order.customerName || '');
      html = renderEmailLayout({
        title: 'Order Confirmation',
        subtitle: 'Thanks for your order — we’re getting started now.',
        orderNumber: payload.order.number,
        bodyHtml: `
          <p style="margin:0 0 12px;font-size:15px;color:#334155;">Hi ${escapeHtml(names.firstName)},</p>
          <p style="margin:0 0 14px;font-size:14px;color:#334155;">Thank you for your order. We’ll send tracking details as soon as your order ships.</p>
          ${renderItems(payload.order.items || [])}
          ${renderTotals({ subtotal: payload.order.subtotal, tax: payload.order.tax, total: payload.order.total, discountCents: payload.order.discountCents, discountLabel: payload.order.discountLabel })}
          ${renderAddress(payload.order)}
          <div style="margin-top:16px;">
            <a href="${escapeHtml(payload.invoiceUrl)}" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;">View Order Details</a>
          </div>
        `,
      });
    } else {
      return { ok: false, error: `Unknown email type: ${type}` };
    }

    const result = await resend.emails.send({
      from: emailFrom,
      to: payload.to,
      replyTo: emailReplyTo,
      subject,
      html
    });

    return { ok: true, id: result.data?.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { 
      ok: false, 
      error: error.message || 'Email send failed',
      details: error
    };
  }
}

// Log email attempt to database
async function logEmailAttempt(attempt) {
  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return;

    const db = neon(dbUrl);
    await db`
      INSERT INTO email_events (type, to_email, provider_msg_id, status, error_message, order_id, created_at)
      VALUES (
        ${attempt.type}, 
        ${attempt.to}, 
        ${attempt.providerMsgId || null}, 
        ${attempt.status}, 
        ${attempt.errorMessage || null}, 
        ${attempt.orderId || null}, 
        NOW()
      )
    `;
  } catch (error) {
    console.error('Failed to log email attempt:', error);
  }
}

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
    const { orderId } = JSON.parse(event.body || '{}');
    
    if (!orderId || typeof orderId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('Database URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const db = neon(dbUrl);
    
    // Load order by ID
    const orderRows = await db`
      SELECT * FROM orders WHERE id = ${orderId}
    `;
    
    if (orderRows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    const order = orderRows[0];
    
    // Load order items
    const itemRows = await db`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;

    // Build origin URL for order details link
    const origin = event.headers['x-forwarded-host']
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';

    const invoiceUrl = `${origin}/orders/${orderId}`;

    // Convert database order to email format
    const emailPayload = {
      to: order.email,
      order: {
        id: order.id,
        number: order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN',
        customerName: order.customer_name || 'Customer',
        items: itemRows.map((item) => ({
          ...normalizeOrderItemDisplay(item),
          name: getItemDisplayName(item),
          quantity: item.quantity,
          price: item.line_total_cents / 100,
          lineTotal: item.line_total_cents / 100,
          unitPrice: item.quantity > 0 ? (item.line_total_cents / 100) / item.quantity : 0,
          options: getEmailItemOptions(item),
          thumbnailUrl: getFinalizedThumbnailUrl(item, 220),
        })),
        // FIX: Calculate correct subtotal, tax, and total from line_total_cents
        // Database values may be incorrect, so recalculate from item totals
        get subtotal() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          return calculatedSubtotal / 100;
        },
        get tax() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          const discount = order.applied_discount_cents || 0;
          const calculatedTax = Math.round((calculatedSubtotal - discount) * 0.06);
          return calculatedTax / 100;
        },
        get total() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          const discount = order.applied_discount_cents || 0;
          const afterDiscount = calculatedSubtotal - discount;
          const calculatedTax = Math.round(afterDiscount * 0.06);
          const calculatedTotal = afterDiscount + calculatedTax;
          return calculatedTotal / 100;
        },
        discountCents: order.applied_discount_cents || 0,
        discountLabel: order.applied_discount_label || '',
        shipping_name: order.shipping_name || order.customer_name || '',
        shipping_street: order.shipping_street || '',
        shipping_street2: order.shipping_street2 || '',
        shipping_city: order.shipping_city || '',
        shipping_state: order.shipping_state || '',
        shipping_zip: order.shipping_zip || '',
        shipping_country: order.shipping_country || 'US',
        shippingAddress: {
          name: order.shipping_name || order.customer_name || '',
          line1: order.shipping_street || '',
          line2: order.shipping_street2 || '',
          city: order.shipping_city || '',
          state: order.shipping_state || '',
          postalCode: order.shipping_zip || '',
          country: order.shipping_country || 'US',
        }
      },
      invoiceUrl
    };

    // Send the email
    const emailResult = await sendEmail('order.confirmation', emailPayload);
    
    // Log email attempt
    await logEmailAttempt({
      type: 'order.confirmation',
      to: order.email,
      orderId: order.id,
      status: emailResult.ok ? 'sent' : 'error',
      providerMsgId: emailResult.ok ? emailResult.id : undefined,
      errorMessage: emailResult.ok ? undefined : `${emailResult.error} ${emailResult.details ? JSON.stringify(emailResult.details) : ''}`.trim()
    });

    if (emailResult.ok) {
      // Update order confirmation email status
      await db`
        UPDATE orders 
        SET confirmation_email_status = 'sent', 
            confirmation_emailed_at = NOW()
        WHERE id = ${orderId}
      `;

      console.log(`Admin resend confirmation successful for order ${orderId}, email ID: ${emailResult.id}`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, id: emailResult.id })
      };
    } else {
      console.error(`Admin resend confirmation failed for order ${orderId}:`, emailResult);
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: emailResult.error || 'Failed to send email',
          details: emailResult.details
        })
      };
    }

  } catch (error) {
    console.error('Admin resend confirmation failed:', error);
    
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
