import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';
import { neon } from '@neondatabase/serverless';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { orderId } = await request.json();
    
    if (!orderId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Order ID is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get order from database
    const dbUrl = import.meta.env.NETLIFY_DATABASE_URL || import.meta.env.DATABASE_URL;
    if (!dbUrl) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Database not configured' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const db = neon(dbUrl);
    
    // Fetch order details
    const orderRows = await db`
      SELECT * FROM orders WHERE id = ${orderId}
    `;
    
    if (orderRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Order not found' }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const order = orderRows[0];
    
    // Fetch order items
    const itemRows = await db`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;

    // Convert database order to email format
    const emailPayload = {
      to: order.customer_email,
      order: {
        id: order.id,
        orderNumber: order.id.slice(-8).toUpperCase(),
        customerName: order.customer_name || 'Customer',
        items: itemRows.map((item: any) => ({
          name: `Custom Banner ${item.width_in}"×${item.height_in}"`,
          quantity: item.quantity,
          price: item.line_total_cents / 100,
          options: [
            `Material: ${item.material}`,
            item.grommets ? `Grommets: ${item.grommets}` : null,
            item.rope_feet && item.rope_feet > 0 ? `Rope: ${item.rope_feet.toFixed(1)} ft` : null,
            item.file_key ? `File: ${item.file_key}` : null
          ].filter(Boolean).join(' • ')
        })),
        subtotal: order.total_cents / 100,
        tax: 0,
        total: order.total_cents / 100,
        shippingAddress: order.shipping_address ? {
          name: order.shipping_address.name,
          address1: order.shipping_address.address1,
          address2: order.shipping_address.address2,
          city: order.shipping_address.city,
          state: order.shipping_address.state,
          zip: order.shipping_address.zip
        } : undefined
      },
      invoiceUrl: `${import.meta.env.PUBLIC_SITE_URL || 'https://bannersonthefly.com'}/orders/${order.id}`
    };

    // Send the email
    const result = await sendEmail('order.confirmation', emailPayload);
    
    if (result.ok) {
      // Update order confirmation email status
      await db`
        UPDATE orders 
        SET confirmation_email_status = 'sent', 
            confirmation_email_sent_at = NOW()
        WHERE id = ${orderId}
      `;
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: result.ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Failed to resend order confirmation:', error);
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: 'Failed to resend confirmation email',
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
