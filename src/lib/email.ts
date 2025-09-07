import { Resend } from 'resend';
import React from 'react';

// React templates
import VerifyEmail from '../emails/VerifyEmail';
import ResetPassword from '../emails/ResetPassword';
import OrderConfirmation from '../emails/OrderConfirmation';
import OrderShipped from '../emails/OrderShipped';
import OrderCanceled from '../emails/OrderCanceled';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `Banners On The Fly <${process.env.EMAIL_FROM || 'info@bannersonthefly.com'}>`;
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

type Result = { ok: true; id: string } | { ok: false; error: string; details?: any };

export async function sendEmail(
  type:
    | 'user.verify'
    | 'user.reset'
    | 'order.confirmation'
    | 'order.shipped'
    | 'order.canceled'
    | '__plain__',
  payload: any
): Promise<Result> {
  try {
    // Plain text bypass (for smoke tests)
    if (type === '__plain__') {
      const { to, subject = 'Test', text = 'Hello' } = payload || {};
      const r = await resend.emails.send({
        from: FROM,
        to,
        subject,
        text,
        reply_to: REPLY_TO,
        tags: [{ name: 'source', value: 'smoke' }],
      });
      if ((r as any).error) throw (r as any).error;
      return { ok: true, id: (r as any).id };
    }

    const to = payload?.to;
    const tags = [];
    if (payload?.order?.id) tags.push({ name: 'order_id', value: String(payload.order.id) });

    const map: Record<string, { subject: string; react: React.ReactElement }> = {
      'user.verify': {
        subject: 'Confirm your Banners On The Fly account',
        react: React.createElement(VerifyEmail, payload),
      },
      'user.reset': {
        subject: 'Reset your password',
        react: React.createElement(ResetPassword, payload),
      },
      'order.confirmation': {
        subject: `Order #${payload?.order?.number || payload?.order?.id} confirmed`,
        react: React.createElement(OrderConfirmation, payload),
      },
      'order.shipped': {
        subject: `Your order #${payload?.order?.number || payload?.order?.id} is on the way`,
        react: React.createElement(OrderShipped, payload),
      },
      'order.canceled': {
        subject: `Order #${payload?.order?.number || payload?.order?.id} canceled`,
        react: React.createElement(OrderCanceled, payload),
      },
    };

    const cfg = map[type];
    if (!cfg) throw new Error(`Unknown email type: ${type}`);
    if (!to) throw new Error('Missing recipient email');

    const resp = await resend.emails.send({
      from: FROM,
      to,
      subject: cfg.subject,
      react: cfg.react,
      reply_to: REPLY_TO,
      tags,
    });

    if ((resp as any).error) throw (resp as any).error;
    return { ok: true, id: (resp as any).id };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
      details: err?.response?.data || err,
    };
  }
}

// Backward compatibility function for existing order confirmation
export async function sendOrderConfirmation(order: any, customerEmail: string): Promise<boolean> {
  try {
    // Convert old order format to new format
    const orderPayload = {
      to: customerEmail,
      order: {
        id: order.id,
        number: order.id.slice(-8).toUpperCase(),
        customerName: order.customer_name || 'Customer',
        items: order.items.map((item: any) => ({
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
        shippingAddress: order.shipping_address
      },
      invoiceUrl: `/orders/${order.id}`
    };

    const result = await sendEmail('order.confirmation', orderPayload);
    return result.ok;
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    // Always return true to avoid blocking the checkout flow
    return true;
  }
}



// Backward compatibility function for existing order confirmation
export async function sendOrderConfirmation(order: any, customerEmail: string): Promise<boolean> {
  try {
    // Convert old order format to new format
    const orderPayload: OrderEmailPayload = {
      to: customerEmail,
      order: {
        id: order.id,
        orderNumber: order.id.slice(-8).toUpperCase(),
        customerName: order.customer_name || 'Customer',
        items: order.items.map((item: any) => ({
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
        shippingAddress: order.shipping_address
      },
      invoiceUrl: `/orders/${order.id}`
    };

    const result = await sendEmail('order.confirmation', orderPayload);
    return result.ok;
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    // Always return true to avoid blocking the checkout flow
    return true;
  }
}
