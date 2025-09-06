import { Order } from './orders/types';
import { EmailAdapter, OrderConfirmationEmail } from './orders/types';
import { usd, formatDimensions } from './pricing';

// Local email adapter (development mode)
class LocalEmailAdapter implements EmailAdapter {
  async sendOrderConfirmation(data: OrderConfirmationEmail): Promise<boolean> {
    console.log('📧 [DEV MODE] Order confirmation email would be sent to:', data.to);
    console.log('📧 [DEV MODE] Order details:', {
      orderId: data.order.id,
      total: usd(data.order.total_cents / 100),
      items: data.order.items.length,
    });
    
    // In development, always return success
    return true;
  }
}

// Resend email adapter
class ResendEmailAdapter implements EmailAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendOrderConfirmation(data: OrderConfirmationEmail): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Banners On The Fly <orders@bannersonthefly.com>',
          to: [data.to],
          subject: `Order Confirmation #${data.order.id.slice(-8).toUpperCase()}`,
          html: generateOrderConfirmationHTML(data.order),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Resend API error:', error);
        return false;
      }

      const result = await response.json();
      console.log('Email sent successfully:', result.id);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}

// Generate HTML email template
function generateOrderConfirmationHTML(order: Order): string {
  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const itemsHTML = order.items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>Custom Banner ${formatDimensions(item.width_in, item.height_in)}</strong><br>
        <span style="color: #6b7280; font-size: 14px;">
          Material: ${item.material} • Quantity: ${item.quantity}
          ${item.grommets ? ` • Grommets: ${item.grommets}` : ''}
          ${item.rope_feet && item.rope_feet > 0 ? ` • Rope: ${item.rope_feet.toFixed(1)} ft` : ''}
          ${item.file_key ? ` • File: ${item.file_key}` : ''}
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        <strong>${usd(item.line_total_cents / 100)}</strong><br>
        <span style="color: #6b7280; font-size: 14px;">
          ${usd(item.unit_price_cents / 100)} each
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 28px;">Order Confirmed!</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
          Thank you for your order. We'll get started on your custom banners right away.
        </p>
      </div>

      <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div>
            <h2 style="margin: 0; color: #1e40af; font-size: 24px;">Banners On The Fly</h2>
            <p style="margin: 5px 0 0 0; color: #6b7280;">Custom Banner Order</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Order #</p>
            <p style="margin: 0; font-weight: bold; font-family: monospace;">
              ${order.id.slice(-8).toUpperCase()}
            </p>
            <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">${orderDate}</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 30px;">
        <h3 style="color: #1f2937; margin-bottom: 15px;">Order Items</h3>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${itemsHTML}
          <tr style="background: #f9fafb;">
            <td style="padding: 20px; font-weight: bold; font-size: 18px;">
              Total Paid
            </td>
            <td style="padding: 20px; text-align: right; font-weight: bold; font-size: 18px;">
              ${usd(order.total_cents / 100)}
            </td>
          </tr>
        </table>
      </div>

      <div style="background: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
        <h3 style="color: #1e40af; margin: 0 0 10px 0;">What's Next?</h3>
        <ul style="margin: 0; padding-left: 20px; color: #1e40af;">
          <li>We'll review your order and contact you within 24 hours</li>
          <li>Production typically takes 3-5 business days</li>
          <li>You'll receive tracking information once shipped</li>
          <li>Questions? Contact us at support@bannersonthefly.com</li>
        </ul>
      </div>

      <div style="text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p>Thank you for choosing Banners On The Fly!</p>
        <p>
          <a href="https://bannersonthefly.com" style="color: #1e40af; text-decoration: none;">
            Visit our website
          </a> • 
          <a href="mailto:support@bannersonthefly.com" style="color: #1e40af; text-decoration: none;">
            Contact Support
          </a>
        </p>
      </div>
    </body>
    </html>
  `;
}

// Adapter selection
let emailAdapter: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (emailAdapter) {
    return emailAdapter;
  }

  const resendApiKey = import.meta.env.VITE_RESEND_API_KEY;

  if (resendApiKey) {
    try {
      emailAdapter = new ResendEmailAdapter(resendApiKey);
      console.log('Using Resend email adapter');
    } catch (error) {
      console.warn('Failed to initialize Resend adapter, falling back to local:', error);
      emailAdapter = new LocalEmailAdapter();
    }
  } else {
    emailAdapter = new LocalEmailAdapter();
    console.log('Using local email adapter (development mode)');
  }

  return emailAdapter;
}

// Convenience function
export async function sendOrderConfirmation(order: Order, customerEmail: string): Promise<boolean> {
  try {
    const emailAdapter = getEmailAdapter();
    return await emailAdapter.sendOrderConfirmation({
      to: customerEmail,
      order,
    });
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    // Always return true to avoid blocking the checkout flow
    return true;
  }
}
