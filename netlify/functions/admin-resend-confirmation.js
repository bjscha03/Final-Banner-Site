const { neon } = require('@neondatabase/serverless');

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
    
    const emailFrom = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let subject, html;
    
    if (type === 'order.confirmation') {
      subject = `Order Confirmation #${payload.order.number} - Banners On The Fly`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Order Confirmation</h2>
          <p>Hello ${payload.order.customerName},</p>
          <p>Thank you for your order! We've received your custom banner order and will begin processing it shortly.</p>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Order Details</h3>
            <p><strong>Order Number:</strong> #${payload.order.number}</p>
            <p><strong>Order ID:</strong> ${payload.order.id}</p>
            
            <h4 style="color: #374151;">Items:</h4>
            ${payload.order.items.map(item => `
              <div style="border-bottom: 1px solid #e5e7eb; padding: 10px 0;">
                <p style="margin: 5px 0;"><strong>${item.name}</strong></p>
                <p style="margin: 5px 0; color: #6b7280;">Quantity: ${item.quantity}</p>
                <p style="margin: 5px 0; color: #6b7280;">${item.options}</p>
                <p style="margin: 5px 0;"><strong>$${item.price.toFixed(2)}</strong></p>
              </div>
            `).join('')}
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
              <p style="margin: 5px 0;">Subtotal: $${payload.order.subtotal.toFixed(2)}</p>
              ${payload.order.tax > 0 ? `<p style="margin: 5px 0;">Tax: $${payload.order.tax.toFixed(2)}</p>` : ''}
              <p style="margin: 5px 0; font-size: 18px;"><strong>Total: $${payload.order.total.toFixed(2)}</strong></p>
            </div>
          </div>
          
          ${payload.order.shippingAddress ? `
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Shipping Address</h3>
              <p style="margin: 5px 0;">${payload.order.shippingAddress}</p>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.invoiceUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Order Details
            </a>
          </div>
          
          <p style="color: #6b7280;">
            We'll send you another email with tracking information once your order ships.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Banners On The Fly<br>
            Custom Banner Printing Services<br>
            Questions? Reply to this email or contact support.
          </p>
        </div>
      `;
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

    // Build origin URL for invoice link
    const origin = event.headers['x-forwarded-host'] 
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';
    
    const invoiceUrl = `${origin}/order-confirmation?orderId=${orderId}`;

    // Convert database order to email format
    const emailPayload = {
      to: order.email,
      order: {
        id: order.id,
        number: order.id.slice(-8).toUpperCase(),
        customerName: order.customer_name || 'Customer',
        items: itemRows.map((item) => ({
          name: `Custom Banner ${item.width_in}"×${item.height_in}"`,
          quantity: item.quantity,
          price: item.line_total_cents / 100,
          options: [
            `Material: ${item.material}`,
            item.grommets && item.grommets !== 'none' ? `Grommets: ${item.grommets}` : null,
            item.rope_feet && item.rope_feet > 0 ? `Rope: ${item.rope_feet.toFixed(1)} ft` : null,
            item.file_key ? `File: ${item.file_key}` : null
          ].filter(Boolean).join(' • ')
        })),
        subtotal: (order.subtotal_cents || order.total_cents) / 100,
        tax: (order.tax_cents || 0) / 100,
        total: order.total_cents / 100,
        shippingAddress: order.shipping_address
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
