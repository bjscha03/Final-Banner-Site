import { Resend } from 'resend';
import React from 'react';
import { neon } from '@neondatabase/serverless';

// React templates
import VerifyEmail from '../emails/VerifyEmail';
import ResetPassword from '../emails/ResetPassword';
import OrderConfirmation from '../emails/OrderConfirmation';
import OrderShipped from '../emails/OrderShipped';
import OrderCanceled from '../emails/OrderCanceled';

// Initialize Resend only when API key is available
let resend: Resend | null = null;
function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Database connection for logging
let db: any = null;
function getDb() {
  if (!db && (process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL)) {
    db = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
  }
  return db;
}

const FROM = `Banners On The Fly <${process.env.EMAIL_FROM || 'info@bannersonthefly.com'}>`;
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

type Result = { ok: true; id: string } | { ok: false; error: string; details?: any };

// Email logging interface
interface EmailLogData {
  type: string;
  to: string;
  orderId?: string;
  providerMsgId?: string;
  status: 'sent' | 'error';
  errorMessage?: string;
}

// Log email attempt to database
export async function logEmailAttempt(data: EmailLogData): Promise<void> {
  try {
    const database = getDb();
    if (!database) {
      console.warn('Database not available for email logging');
      return;
    }

    await database`
      INSERT INTO email_events (type, to_email, order_id, provider_msg_id, status, error_message, created_at)
      VALUES (${data.type}, ${data.to}, ${data.orderId || null}, ${data.providerMsgId || null}, ${data.status}, ${data.errorMessage || null}, NOW())
    `;
  } catch (error) {
    console.error('Failed to log email attempt:', error);
    // Don't throw - logging failures shouldn't break email sending
  }
}

// Retry logic with exponential backoff
async function sendWithRetry(resendClient: any, emailData: any, maxAttempts = 3): Promise<any> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await resendClient.emails.send(emailData);
      if ((result as any).error) {
        throw (result as any).error;
      }
      return result;
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable (429 rate limit or 5xx server errors)
      const isRetryable = error?.status === 429 || (error?.status >= 500 && error?.status < 600);

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff: 300ms, 900ms
      const delay = attempt === 1 ? 300 : 900;
      await new Promise(resolve => setTimeout(resolve, delay));

      console.log(`Email send attempt ${attempt} failed, retrying in ${delay}ms:`, error?.message);
    }
  }

  throw lastError;
}

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
  const to = payload?.to;
  const orderId = payload?.order?.id;

  try {
    const resendClient = getResend();
    if (!resendClient) {
      const error = 'Resend API key not configured';
      await logEmailAttempt({
        type,
        to: to || 'unknown',
        orderId,
        status: 'error',
        errorMessage: error
      });
      return { ok: false, error };
    }

    // Plain text bypass (for smoke tests)
    if (type === '__plain__') {
      const { to, subject = 'Test', text = 'Hello' } = payload || {};
      const emailData = {
        from: FROM,
        to,
        subject,
        text,
        reply_to: REPLY_TO,
        tags: [{ name: 'source', value: 'smoke' }],
      };

      const result = await sendWithRetry(resendClient, emailData);
      const id = (result as any).id;

      await logEmailAttempt({
        type,
        to,
        providerMsgId: id,
        status: 'sent'
      });

      return { ok: true, id };
    }

    const tags = [];
    if (orderId) tags.push({ name: 'order_id', value: String(orderId) });

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
        subject: `Order #${payload?.order?.order_number || payload?.order?.number || payload?.order?.id} confirmed`,
        react: React.createElement(OrderConfirmation, payload),
      },
      'order.shipped': {
        subject: `Your order #${payload?.order?.order_number || payload?.order?.number || payload?.order?.id} is on the way`,
        react: React.createElement(OrderShipped, payload),
      },
      'order.canceled': {
        subject: `Order #${payload?.order?.order_number || payload?.order?.number || payload?.order?.id} canceled`,
        react: React.createElement(OrderCanceled, payload),
      },
    };

    const cfg = map[type];
    if (!cfg) {
      const error = `Unknown email type: ${type}`;
      await logEmailAttempt({
        type,
        to: to || 'unknown',
        orderId,
        status: 'error',
        errorMessage: error
      });
      throw new Error(error);
    }

    if (!to) {
      const error = 'Missing recipient email';
      await logEmailAttempt({
        type,
        to: 'unknown',
        orderId,
        status: 'error',
        errorMessage: error
      });
      throw new Error(error);
    }

    const emailData = {
      from: FROM,
      to,
      subject: cfg.subject,
      react: cfg.react,
      reply_to: REPLY_TO,
      tags,
    };

    const result = await sendWithRetry(resendClient, emailData);
    const id = (result as any).id;

    await logEmailAttempt({
      type,
      to,
      orderId,
      providerMsgId: id,
      status: 'sent'
    });

    return { ok: true, id };
  } catch (err: any) {
    const errorMessage = err?.message || String(err);
    const details = err?.response?.data || err;

    await logEmailAttempt({
      type,
      to: to || 'unknown',
      orderId,
      status: 'error',
      errorMessage: `${errorMessage} ${details ? JSON.stringify(details) : ''}`.trim()
    });

    return {
      ok: false,
      error: errorMessage,
      details,
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


