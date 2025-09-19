# Transactional Email System Guide

## Overview

The Banners On The Fly transactional email system provides reliable, production-ready email functionality using Resend with React Email templates and comprehensive webhook tracking.

## Email Types

### User Emails
- **`user.verify`** - Account verification email with confirmation link
- **`user.reset`** - Password reset email with secure reset link

### Order Emails  
- **`order.confirmation`** - Order confirmation with invoice and details
- **`order.shipped`** - Shipping notification with tracking information
- **`order.canceled`** - Order cancellation with refund details

## Usage

### Basic Email Sending

```typescript
import { sendEmail } from '../lib/email';

// Send order confirmation
const result = await sendEmail('order.confirmation', {
  to: 'customer@example.com',
  order: {
    id: 'order-123',
    orderNumber: 'BO12345',
    customerName: 'John Doe',
    items: [...],
    total: 134.97,
    // ... other order details
  },
  invoiceUrl: 'https://bannersonthefly.com/orders/order-123'
});

if (result.ok) {
  console.log('Email sent:', result.id);
} else {
  console.error('Email failed:', result.error);
}
```

### Integration Points

#### 1. Signup Flow
```typescript
// After account creation
await sendEmail('user.verify', {
  to: user.email,
  verifyUrl: `https://bannersonthefly.com/verify?token=${verifyToken}`,
  userName: user.name
});
```

#### 2. Password Reset
```typescript
// After reset token creation
await sendEmail('user.reset', {
  to: user.email,
  resetUrl: `https://bannersonthefly.com/reset?token=${resetToken}`,
  userName: user.name
});
```

#### 3. Order Confirmation
```typescript
// After successful checkout
await sendEmail('order.confirmation', {
  to: order.customerEmail,
  order: orderData,
  invoiceUrl: `/orders/${order.id}`
});
```

#### 4. Order Shipped
```typescript
// When admin adds tracking
await sendEmail('order.shipped', {
  to: order.customerEmail,
  order: orderData,
  trackingNumber: '1Z999AA1234567890',
  trackingUrl: 'https://fedex.com/track?...',
  carrier: 'FedEx'
});
```

## Testing

### Test Functions

**Test all email types:**
```
https://bannersonthefly.com/.netlify/functions/send-transactional-test?type=order.confirmation
https://bannersonthefly.com/.netlify/functions/send-transactional-test?type=user.verify
https://bannersonthefly.com/.netlify/functions/send-transactional-test?type=order.shipped
```

**Custom recipient:**
```
https://bannersonthefly.com/.netlify/functions/send-transactional-test?type=order.confirmation&to=test@example.com
```

### Admin Tools

**Resend order confirmation:**
```typescript
POST /api/admin/resend-confirmation
{
  "orderId": "order-123"
}
```

## Database Integration

### Email Events Table
All emails are logged to `email_events` with:
- `type` - Email type (user.verify, order.confirmation, etc.)
- `to_email` - Recipient email address
- `provider_msg_id` - Resend message ID for webhook correlation
- `status` - Current status (sent, delivered, bounced, etc.)
- `order_id` - Associated order ID (for order emails)

### Order Status Tracking
Order confirmations update `orders.confirmation_email_status`:
- `pending` - Not sent yet
- `sent` - Email sent successfully
- `delivered` - Email delivered (via webhook)
- `bounced` - Email bounced
- `complained` - Marked as spam

## Webhook Integration

The webhook system automatically updates email statuses:
- **Delivered** - Email successfully delivered
- **Bounced** - Email bounced (invalid address, etc.)
- **Complained** - Recipient marked as spam
- **Opened** - Email was opened (if tracking enabled)

Status precedence: `complained > bounced > delivered > opened > sent`

## Environment Variables

### Required
- `RESEND_API_KEY` - Resend API key (server-only)
- `DATABASE_URL` or `NETLIFY_DATABASE_URL` - Database connection

### Optional
- `EMAIL_FROM` - From address (default: "Banners On The Fly <info@bannersonthefly.com>")
- `EMAIL_REPLY_TO` - Reply-to address (default: "support@bannersonthefly.com")

## Security Features

- **Server-only secrets** - API keys never exposed to client
- **Graceful failures** - Checkout never blocked by email failures
- **Webhook verification** - HMAC signature validation
- **Error logging** - All failures logged to database

## Email Templates

All templates are mobile-responsive React components using `@react-email/components` with company logo:

- **VerifyEmail.tsx** - Blue gradient header, company logo, clear CTA button
- **ResetPassword.tsx** - Red gradient header, company logo, security warnings
- **OrderConfirmation.tsx** - Complete order details, company logo, invoice link
- **OrderShipped.tsx** - Green gradient, company logo, tracking information
- **OrderCanceled.tsx** - Red gradient, company logo, refund details
- **ContactReceived.tsx** - Admin notification with company logo
- **ContactAcknowledgment.tsx** - Customer acknowledgment with company logo
- **AdminOrderNotification.tsx** - Admin order notification with company logo

### Logo Implementation
- All templates include the company logo at the top
- Uses the compact logo variant (300×90px) optimized for email
- Logo URL: `${PUBLIC_SITE_URL}/images/logo-compact.svg`
- Includes proper alt text and fallback handling
- Styled for consistent display across email clients

## Database Migration

Run `database-email-migration.sql` to set up required table columns:

```sql
-- Add email tracking columns
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_status VARCHAR(20);
-- ... see full migration file
```

## Monitoring

### Logs to Check
- **Netlify Function Logs** - Email send results and webhook updates
- **Resend Dashboard** - Delivery statistics and webhook status
- **Database** - Email events and status progression

### Key Metrics
- Email delivery rates by type
- Webhook processing success
- Order confirmation delivery status
- Bounce and complaint rates

## Troubleshooting

### Common Issues

1. **Import errors in Netlify Functions**
   - Ensure functions use CommonJS (`require()`) not ESM (`import`)

2. **Email not sending**
   - Check `RESEND_API_KEY` environment variable
   - Verify from address is verified in Resend

3. **Webhook not updating status**
   - Check webhook signature verification
   - Ensure `RESEND_WEBHOOK_SECRET` is set correctly

4. **Template rendering errors**
   - Verify all required props are provided
   - Check React Email component imports

### Debug Commands

```bash
# Test email sending
curl "https://bannersonthefly.com/.netlify/functions/send-transactional-test?type=order.confirmation"

# Check database logs
SELECT * FROM email_events ORDER BY created_at DESC LIMIT 10;

# Verify webhook processing
SELECT * FROM email_events WHERE provider_msg_id IS NOT NULL;
```
