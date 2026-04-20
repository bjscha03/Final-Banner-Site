const { neon } = require('@neondatabase/serverless');
const { getItemDisplayName } = require('./product-display-helpers.cjs');

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

    const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Banner is Now in Production</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="${logoUrl}" alt="Banners On The Fly" style="height: 60px;">
        </div>
        
        <div style="background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 28px;">Your Banner is Now in Production 🎯</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">We're printing your custom banner right now</p>
        </div>
        
        <div style="background: #fefce8; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="margin: 0; color: #d97706;">Banners On The Fly</h2>
              <p style="margin: 5px 0; color: #666;">Order In Production</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; color: #666; font-size: 14px;">Order #</p>
              <p style="margin: 0; font-weight: bold; font-size: 18px;">${order.orderNumber}</p>
            </div>
          </div>
        </div>
        
        <div style="margin-bottom: 30px;">
          <p>Hi ${order.customerName},</p>
          <p>Good news — your banner order is now in production.</p>
          <p>Our team is currently printing and preparing your banner. Once it's complete, it will ship out with tracking information sent to you immediately.</p>
        </div>
        
        <div style="background: #fefce8; padding: 20px; border-radius: 8px; border: 1px solid #fde68a; margin-bottom: 30px;">
          <h3 style="margin: 0 0 15px 0; color: #333;">Order Details</h3>
          ${order.items.map(item => `
            <div style="margin-bottom: 8px;">
              <p style="margin: 0; color: #666; font-size: 14px;"><strong>Order #:</strong> ${order.orderNumber}</p>
              <p style="margin: 0; color: #666; font-size: 14px;"><strong>Size:</strong> ${item.dimensions}</p>
              <p style="margin: 0; color: #666; font-size: 14px;"><strong>Material:</strong> ${item.material}</p>
            </div>
          `).join('<hr style="border-color: #fde68a; margin: 10px 0;">')}
        </div>
        
        <div style="margin-bottom: 30px;">
          <p>If you have any questions, feel free to reply to this email.</p>
          <p><strong>Thanks for choosing Banners On The Fly!</strong></p>
          <p style="color: #666; font-style: italic;">– Banners On The Fly Team</p>
        </div>
        
        <div style="text-align: center; color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px;">
          <p>Thank you for choosing Banners On The Fly!</p>
          <p>
            <a href="https://bannersonthefly.com" style="color: #1e40af; text-decoration: underline;">Visit our website</a>
            &bull;
            <a href="mailto:support@bannersonthefly.com" style="color: #1e40af; text-decoration: underline;">Contact Support</a>
          </p>
        </div>
      </body>
      </html>
    `;

    const emailData = {
      from: emailFrom,
      to: customerEmail,
      subject: 'Your Banner is Now in Production 🎯',
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
    const customerName = order.full_name || 'Valued Customer';

    // Get order items
    const itemsResult = await sql`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;

    // Format order data for email
    const emailOrder = {
      id: order.id,
      orderNumber: order.id.slice(-8).toUpperCase(),
      customerName: customerName,
      items: itemsResult.map(item => ({
        name: getItemDisplayName(item),
        quantity: item.quantity,
        dimensions: `${item.width_in}" × ${item.height_in}"`,
        material: item.material
      }))
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
