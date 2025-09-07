import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { sendEmail, logEmailAttempt } from '../../src/lib/email';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const handler: Handler = async (event) => {
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

    // Build origin URL for invoice link
    const origin = event.headers['x-forwarded-host'] 
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';
    
    const invoiceUrl = `${origin}/orders/${orderId}`;

    // Convert database order to email format
    const emailPayload = {
      to: order.email,
      order: {
        id: order.id,
        number: order.id.slice(-8).toUpperCase(),
        customerName: order.customer_name || 'Customer',
        items: itemRows.map((item: any) => ({
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
        details: error instanceof Error ? error.message : String(error)
      })
    };
  }
};
