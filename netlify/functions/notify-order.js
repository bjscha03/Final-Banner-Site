const { neon } = require('@neondatabase/serverless');

// Email-compatible logo header HTML
function createEmailLogoHeader() {
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
  
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
      <tr>
        <td style="padding: 20px 0 30px 0; text-align: center; background-color: #ffffff;">
          <img src="${logoUrl}" 
               alt="Banners on the Fly - Custom Banner Printing" 
               width="200" 
               height="auto" 
               style="display: block; margin: 0 auto; max-width: 100%; height: auto; border: 0;" />
        </td>
      </tr>
    </table>
  `;
}

// Email container wrapper with proper email client compatibility
function createEmailContainer(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if !mso]><!-->
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <!--<![endif]-->
      <title>Banners on the Fly</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0; background-color: #f4f4f4;">
        <tr>
          <td style="padding: 20px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" align="center">
              <tr>
                <td>
                  ${createEmailLogoHeader()}
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

const { createEmailLogoHeader, createEmailContainer } = require('../../src/lib/email');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Send email with retry logic for rate limiting
async function sendEmailWithRetry(resendClient, emailData, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await resendClient.emails.send(emailData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable (429 rate limit or 5xx server errors)
      const isRetryable = error?.status === 429 || (error?.status >= 500 && error?.status < 600) ||
                         error?.message?.includes('Too many requests');

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff: 1s, 3s for rate limiting
      const delay = attempt === 1 ? 1000 : 3000;
      await new Promise(resolve => setTimeout(resolve, delay));

      console.log(`Email send attempt ${attempt} failed (rate limited), retrying in ${delay}ms:`, error?.message);
    }
  }

  throw lastError;
}

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
      html = createEmailContainer(`
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 20px;">
          <tr>
            <td>
              <h2 style="color: #2563eb; margin: 0 0 20px 0; font-size: 28px; text-align: center;">Order Confirmation</h2>
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
            </td>
          </tr>
        </table>
      `);
    } else if (type === 'order.admin_notification') {
      subject = `🎉 New Order #${payload.order.number} - $${payload.order.total.toFixed(2)}`;
      html = createEmailContainer(`
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 20px;">
          <tr>
            <td>
              <h2 style="color: #059669; margin: 0 0 20px 0; font-size: 28px; text-align: center;">🎉 New Order Received!</h2>
          <p>A customer has placed a new order on Banners On The Fly</p>

          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Order Information</h3>
            <p><strong>Order Number:</strong> #${payload.order.number}</p>
            <p><strong>Order ID:</strong> ${payload.order.id}</p>
            <p><strong>Customer:</strong> ${payload.order.customerName}</p>
            <p><strong>Email:</strong> <a href="mailto:${payload.order.email}">${payload.order.email}</a></p>
            <p><strong>Total Amount:</strong> <span style="color: #059669; font-weight: bold;">$${payload.order.total.toFixed(2)}</span></p>

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
              View Full Order Details
            </a>
          </div>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Banners On The Fly order system.<br>
            <a href="mailto:${payload.order.email}">Contact customer</a> •
            <a href="https://bannersonthefly.com">Visit website</a>
          </p>
            </td>
          </tr>
        </table>
      `);
    } else {
      return { ok: false, error: `Unknown email type: ${type}` };
    }

    const emailData = {
      from: emailFrom,
      to: payload.to,
      replyTo: emailReplyTo,
      subject,
      html
    };

    const result = await sendEmailWithRetry(resend, emailData);

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

    // Idempotency Check: If already sent, return success without sending
    if (order.confirmation_email_status === 'sent' || order.confirmation_emailed_at) {
      console.log(`Order ${orderId} confirmation email already sent, returning idempotent response`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, idempotent: true })
      };
    }
    
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

    // Send confirmation email
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
      // Update order with confirmation email status
      await db`
        UPDATE orders
        SET confirmation_email_status = 'sent',
            confirmation_emailed_at = NOW()
        WHERE id = ${orderId}
      `;

      console.log(`Order confirmation email sent successfully for order ${orderId}, email ID: ${emailResult.id}`);

      // Send admin notification email to info@bannersonthefly.com
      const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';

      try {
        // Add delay to prevent rate limiting (Resend allows 2 requests per second)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const adminEmailPayload = {
          to: adminEmail,
          order: {
            ...emailPayload.order,
            email: order.email, // Add customer email to admin notification
            created_at: order.created_at
          },
          invoiceUrl: emailPayload.invoiceUrl
        };

        const adminEmailResult = await sendEmail('order.admin_notification', adminEmailPayload);

        // Log admin email attempt
        await logEmailAttempt({
          type: 'order.admin_notification',
          to: adminEmail,
          orderId: order.id,
          status: adminEmailResult.ok ? 'sent' : 'error',
          providerMsgId: adminEmailResult.ok ? adminEmailResult.id : undefined,
          errorMessage: adminEmailResult.ok ? undefined : `${adminEmailResult.error} ${adminEmailResult.details ? JSON.stringify(adminEmailResult.details) : ''}`.trim()
        });

        if (adminEmailResult.ok) {
          // Update order with admin notification status
          await db`
            UPDATE orders
            SET admin_notification_status = 'sent',
                admin_notification_sent_at = NOW()
            WHERE id = ${orderId}
          `;
          console.log(`Admin notification email sent successfully for order ${orderId}, email ID: ${adminEmailResult.id}`);
        } else {
          console.error(`Admin notification email failed for order ${orderId}:`, adminEmailResult);
          // Don't fail the main request if admin email fails
        }
      } catch (adminEmailError) {
        console.error(`Admin notification email error for order ${orderId}:`, adminEmailError);
        // Log the failed attempt
        await logEmailAttempt({
          type: 'order.admin_notification',
          to: adminEmail,
          orderId: order.id,
          status: 'error',
          errorMessage: adminEmailError.message || 'Unknown error'
        });
        // Don't fail the main request if admin email fails
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, id: emailResult.id })
      };
    } else {
      console.error(`Order confirmation email failed for order ${orderId}:`, emailResult);
      
      // Don't update order status on failure, allowing for retry
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
    console.error('Order notification failed:', error);
    
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
