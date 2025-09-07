# Netlify Functions

## send-test-email.js

A minimal Netlify Function (CommonJS) to send test emails via Resend API, designed to trigger webhook events for testing purposes.

## resend-webhook.js

A Netlify Function (CommonJS) to handle Resend webhook events, storing them in the database and updating email statuses.

### Usage

**Basic Usage:**
```
GET https://your-site.netlify.app/.netlify/functions/send-test-email
```

**Custom Recipient:**
```
GET https://your-site.netlify.app/.netlify/functions/send-test-email?to=test@example.com
```

### Response Format

**Success:**
```json
{
  "ok": true,
  "id": "resend-message-id-here"
}
```

**Error:**
```json
{
  "ok": false,
  "error": "error details here"
}
```

### Environment Variables Required

- `RESEND_API_KEY` - Your Resend API key (required)
- `EMAIL_FROM_INFO` - From email address (optional, defaults to info@bannersonthefly.com)
- `EMAIL_REPLY_TO` - Reply-to email address (optional, defaults to support@bannersonthefly.com)
- `NETLIFY_DATABASE_URL` or `DATABASE_URL` - Database connection (optional, for logging)

### Features

- **Browser-triggered**: No CLI tools needed, just visit the URL
- **Database logging**: Optionally logs email status to `emails` table
- **Error handling**: Graceful error handling with JSON responses
- **Customizable recipient**: Use query parameter to specify recipient
- **Production-ready**: Uses environment variables and proper error handling

### Database Integration

If database environment variables are available, the function will:
1. Log a "queued" email record when starting
2. Update to "sent" status with provider message ID on success
3. Update to "failed" status with error details on failure

This provides visibility into email sending status in your database.

### Webhook Function

The `resend-webhook.js` function handles incoming webhook events from Resend:

- **Signature Verification**: Validates webhook authenticity using HMAC-SHA256
- **Event Storage**: Stores all webhook events in `email_events` table
- **Status Updates**: Maps webhook events to email status updates:
  - `email.delivered` → `delivered`
  - `email.bounced` → `bounced`
  - `email.complained` → `complained`

**Webhook URL**: `https://your-site.netlify.app/.netlify/functions/resend-webhook`

**Required Environment Variable**: `RESEND_WEBHOOK_SECRET`
