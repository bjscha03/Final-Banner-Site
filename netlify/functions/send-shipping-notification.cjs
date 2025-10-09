const { neon } = require('@neondatabase/serverless');
const { titleCaseName } = require('./lib/strings');

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
      const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
      
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Order Has Shipped</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="${logoUrl}" alt="Banners On The Fly" style="height: 60px;">
          </div>
          
          <div style="background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">Your Order is On The Way!</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Your custom banners have shipped and are heading your way</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h2 style="margin: 0; color: #ff6b35;">Banners On The Fly</h2>
                <p style="margin: 5px 0; color: #666;">Order Shipped</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0; color: #666; font-size: 14px;">Order #</p>
                <p style="margin: 0; font-weight: bold; font-size: 18px;">${order.orderNumber}</p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Shipped ${new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
          
          <div style="margin-bottom: 30px;">
            <p>Hi ${order.customerName},</p>
            <p>Great news! Your custom banner order has been completed and shipped. Your package is now on its way to you.</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="margin: 0 0 15px 0; color: #333;">Tracking Information</h3>
            <div style="display: flex; gap: 30px; margin-bottom: 20px;">
              <div>
                <p style="margin: 0; color: #666; font-size: 14px;">Carrier</p>
                <p style="margin: 5px 0 0 0; font-weight: bold;">FedEx</p>
              </div>
              <div>
                <p style="margin: 0; color: #666; font-size: 14px;">Tracking Number</p>
                <p style="margin: 5px 0 0 0; font-weight: bold; font-family: monospace;">${trackingNumber}</p>
              </div>
            </div>
            ${trackingUrl ? `
              <div style="text-align: center;">
                <a href="${trackingUrl}" style="background: #ff6b35; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Track Your Package</a>
              </div>
            ` : ''}
          </div>
          
          ${order.shippingAddress ? `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin: 0 0 15px 0; color: #333;">Shipping To</h3>
              <div>
                <p style="margin: 0;">${order.shippingAddress.name}</p>
                <p style="margin: 0;">${order.shippingAddress.address1}</p>
                ${order.shippingAddress.address2 ? `<p style="margin: 0;">${order.shippingAddress.address2}</p>` : ''}
                <p style="margin: 0;">${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zip}</p>
              </div>
            </div>
          ` : ''}
          
          <div style="margin-bottom: 30px;">
            <h3 style="color: #333;">Order Summary</h3>
            ${order.items.map(item => `
              <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
                <p style="margin: 0; font-weight: bold;">${item.name}</p>
                <p style="margin: 5px 0; color: #666; font-size: 14px;">Quantity: ${item.quantity} | Price: $${item.price.toFixed(2)}</p>
                ${item.options ? `<p style="margin: 5px 0; color: #666; font-size: 14px;">${item.options}</p>` : ''}
              </div>
            `).join('')}
            <div style="text-align: right; margin-top: 15px; padding-top: 15px; border-top: 2px solid #ff6b35;">
              <p style="margin: 0; font-size: 18px; font-weight: bold;">Total: $${order.total.toFixed(2)}</p>
            </div>
          </div>
          
          <div style="text-align: center; color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px;">
            <p>Thank you for choosing Banners On The Fly!</p>
            <p>If you have any questions, please contact us at <a href="mailto:support@bannersonthefly.com">support@bannersonthefly.com</a></p>
          </div>
        </body>
        </html>
      `;
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
    const customerName = titleCaseName(order.full_name || 'Valued Customer');

    // Get order items
    const itemsResult = await sql`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;

    // Format order data for email - provide both formats for compatibility
    const emailOrder = {
      id: order.id,
      orderNumber: order.id.slice(-8).toUpperCase(),
      customerName: customerName,
      email: customerEmail,
      items: itemsResult.map(item => ({
        name: `Custom Banner (${item.width_in}" x ${item.height_in}")`,
        quantity: item.quantity,
        price: item.line_total_cents / 100 / item.quantity, // Calculate unit price from line total
        options: `${item.material} material${item.grommets && item.grommets !== 'none' ? `, ${item.grommets} grommets` : ''}${item.rope_feet > 0 ? `, ${item.rope_feet}ft rope` : ''}`
      })),
      subtotal: order.subtotal_cents / 100,
      tax: order.tax_cents / 100,
      total: order.total_cents / 100,
      subtotalCents: order.subtotal_cents,
      taxCents: order.tax_cents,
      totalCents: order.total_cents,
      shippingAddress: undefined // No shipping address table in current schema
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
