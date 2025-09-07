import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';
import { render } from '@react-email/render';
import VerifyEmail from '../emails/VerifyEmail';
import ResetPassword from '../emails/ResetPassword';
import OrderConfirmation from '../emails/OrderConfirmation';
import OrderShipped from '../emails/OrderShipped';
import OrderCanceled from '../emails/OrderCanceled';

// Email types
export type EmailType = 'user.verify' | 'user.reset' | 'order.confirmation' | 'order.shipped' | 'order.canceled';

// Email payloads
export interface VerifyEmailPayload {
  to: string;
  verifyUrl: string;
  userName?: string;
}

export interface ResetPasswordPayload {
  to: string;
  resetUrl: string;
  userName?: string;
}

export interface OrderEmailPayload {
  to: string;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      options?: string;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    shippingAddress?: {
      name: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  invoiceUrl?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
}

export type EmailPayload = VerifyEmailPayload | ResetPasswordPayload | OrderEmailPayload;

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'Banners On The Fly <info@bannersonthefly.com>';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

// Database logging
async function logEmailEvent(
  type: EmailType,
  toEmail: string,
  providerMsgId: string | null,
  status: 'sent' | 'error',
  orderId?: string,
  errorMessage?: string
) {
  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return;

    const db = neon(dbUrl);
    await db`
      INSERT INTO email_events (type, to_email, provider_msg_id, status, order_id, error_message, created_at)
      VALUES (${type}, ${toEmail}, ${providerMsgId}, ${status}, ${orderId}, ${errorMessage}, NOW())
    `;
  } catch (error) {
    console.error('Failed to log email event:', error);
  }
}

// Email templates and subjects
const emailTemplates = {
  'user.verify': {
    component: VerifyEmail,
    subject: 'Confirm your Banners On The Fly account'
  },
  'user.reset': {
    component: ResetPassword,
    subject: 'Reset your password'
  },
  'order.confirmation': {
    component: OrderConfirmation,
    subject: (payload: OrderEmailPayload) => `Order #${payload.order.orderNumber} confirmed`
  },
  'order.shipped': {
    component: OrderShipped,
    subject: (payload: OrderEmailPayload) => `Your order #${payload.order.orderNumber} is on the way`
  },
  'order.canceled': {
    component: OrderCanceled,
    subject: (payload: OrderEmailPayload) => `Order #${payload.order.orderNumber} canceled`
  }
};

/**
 * Send transactional email
 */
export async function sendEmail(type: EmailType, payload: EmailPayload): Promise<EmailResult> {
  try {
    const template = emailTemplates[type];
    if (!template) {
      return { ok: false, error: `Unknown email type: ${type}` };
    }

    // Get subject
    const subject = typeof template.subject === 'function'
      ? template.subject(payload as any)
      : template.subject;

    // Render email HTML
    const html = render(template.component(payload as any));

    // Prepare tags
    const tags: Array<{ name: string; value: string }> = [];
    if ('order' in payload && payload.order?.id) {
      tags.push({ name: 'order_id', value: payload.order.id });
    }

    // Send email
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: payload.to,
      subject,
      html,
      reply_to: EMAIL_REPLY_TO,
      tags
    });

    if (error) {
      // Log error
      const orderId = 'order' in payload ? payload.order?.id : undefined;
      await logEmailEvent(type, payload.to, null, 'error', orderId, String(error));

      return { ok: false, error: String(error) };
    }

    // Log success
    const orderId = 'order' in payload ? payload.order?.id : undefined;
    await logEmailEvent(type, payload.to, data?.id || null, 'sent', orderId);

    return { ok: true, id: data?.id };

  } catch (error) {
    console.error('Email send failed:', error);

    // Log error
    const orderId = 'order' in payload ? (payload as any).order?.id : undefined;
    await logEmailEvent(type, payload.to, null, 'error', orderId, String(error));

    return { ok: false, error: String(error) };
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
