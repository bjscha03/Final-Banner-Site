# Comprehensive Email System Guide - Banners On The Fly

## 🎯 System Overview

The Banners On The Fly email system provides production-ready transactional emails with comprehensive logging, retry logic, and monitoring. The system is designed to never block core user flows while providing complete visibility into email delivery status.

## 📧 Email Types Supported

### User Authentication Emails
- **`user.verify`** - Account verification with confirmation link
- **`user.reset`** - Password reset with secure token link

### Order Management Emails  
- **`order.confirmation`** - Order confirmation with invoice details
- **`order.shipped`** - Shipping notification with tracking
- **`order.canceled`** - Order cancellation with refund info

### Testing
- **`__plain__`** - Plain text smoke test for debugging

## 🔧 Core Features

### Retry Logic with Exponential Backoff
- **3 total attempts** (initial + 2 retries)
- **Backoff timing**: 300ms → 900ms
- **Retry conditions**: HTTP 429 (rate limit) or 5xx server errors only
- **Non-retryable**: 4xx client errors fail immediately

### Comprehensive Database Logging
- **All attempts logged** to `email_events` table
- **Real-time status tracking** via webhooks
- **Order correlation** for business intelligence
- **Error details** for debugging

### Status Precedence System
Webhook updates follow precedence: `complained > bounced > delivered > opened > sent`

## 🗄️ Database Schema

### email_events Table
```sql
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                    -- Email type
  to_email TEXT NOT NULL,               -- Recipient
  provider_msg_id TEXT,                 -- Resend message ID
  status TEXT NOT NULL,                 -- Current status
  error_message TEXT,                   -- Error details
  order_id TEXT,                        -- Order correlation
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### password_resets Table
```sql
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,      -- 30 minute expiration
  used_at TIMESTAMPTZ,                  -- Single use tracking
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🚀 API Endpoints

### Email Testing & Monitoring
- **`/.netlify/functions/send-test-email`** - Debug individual email types
- **`/.netlify/functions/email-system-test`** - Comprehensive system test
- **`/.netlify/functions/email-monitoring`** - System health & metrics

### Password Reset Flow
- **`POST /api/auth/request-password-reset`** - Request reset token
- **`POST /api/auth/reset-password`** - Complete password reset

### Order Management
- **`POST /api/admin/resend-confirmation`** - Resend order confirmation

## 🔐 Password Reset Flow

### 1. Request Reset
```typescript
POST /api/auth/request-password-reset
{
  "email": "user@example.com"
}
```
- Generates secure UUID token
- 30-minute expiration
- Always returns success (prevents email enumeration)

### 2. Reset Password
```typescript
POST /api/auth/reset-password
{
  "token": "uuid-token",
  "newPassword": "newSecurePassword"
}
```
- Validates token (not expired, not used)
- Updates user password
- Marks token as used

### 3. UI Components
- **`/forgot-password`** - Email input form
- **`/reset-password?token=...`** - New password form
- **Sign In page** - "Forgot password?" link

## 📊 Monitoring & Observability

### Health Check Endpoints
```bash
# System test with specific email type
curl "https://bannersonthefly.com/.netlify/functions/email-system-test?to=test@example.com&type=user.verify"

# Email monitoring dashboard
curl "https://bannersonthefly.com/.netlify/functions/email-monitoring?timeframe=24h"
```

### Key Metrics Tracked
- **Email delivery rates** by type
- **Failed emails** requiring attention  
- **Order confirmation status** overview
- **System health** indicators

### Database Queries for Monitoring
```sql
-- Recent email activity (last 24 hours)
SELECT created_at, type, to_email, status, error_message
FROM email_events
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Failed emails requiring attention
SELECT * FROM email_events 
WHERE status = 'error' AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Order confirmation delivery rates
SELECT 
  COUNT(*) as total_sent,
  COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
  ROUND(COUNT(CASE WHEN status = 'delivered' THEN 1 END) * 100.0 / COUNT(*), 2) as delivery_rate
FROM email_events
WHERE type = 'order.confirmation' AND created_at > NOW() - INTERVAL '7 days';
```

## 🔒 Security & Reliability

### Never Block Core Flows
- **Order creation** completes regardless of email status
- **User signup** succeeds even if verification email fails
- **Password reset** always returns success response

### Error Handling
- **Graceful degradation** with detailed logging
- **Provider error details** captured for debugging
- **Retry logic** for transient failures only

### Security Features
- **HMAC webhook verification** prevents spoofing
- **Secure token generation** for password resets
- **Token expiration** and single-use enforcement
- **No email enumeration** in password reset flow

## 🧪 Testing Scenarios

### 1. Order Flow Test
```bash
# Test order confirmation email
curl -X POST "https://bannersonthefly.com/.netlify/functions/email-system-test?to=test@example.com&type=order.confirmation"
```

### 2. Password Reset Test
```bash
# Test complete password reset flow
curl -X POST "/api/auth/request-password-reset" -d '{"email":"test@example.com"}'
# Check email for reset link, then:
curl -X POST "/api/auth/reset-password" -d '{"token":"uuid-token","newPassword":"newpass123"}'
```

### 3. System Health Test
```bash
# Comprehensive system test
curl "https://bannersonthefly.com/.netlify/functions/email-system-test?to=test@example.com&type=all"
```

## 🚨 Troubleshooting

### Common Issues
1. **Emails not sending** → Check `RESEND_API_KEY` and domain verification
2. **Webhooks not updating** → Verify `RESEND_WEBHOOK_SECRET` configuration  
3. **Database logging fails** → Check `NETLIFY_DATABASE_URL` connection
4. **Password reset not working** → Ensure `password_resets` table exists

### Debug Commands
```bash
# Check email system health
curl "https://bannersonthefly.com/.netlify/functions/email-monitoring"

# Test specific email type
curl "https://bannersonthefly.com/.netlify/functions/send-test-email?type=user.verify&to=debug@example.com&debug=1"

# View recent email events
psql $DATABASE_URL -c "SELECT * FROM email_events ORDER BY created_at DESC LIMIT 10;"
```

## 🎉 Success Criteria Met

✅ **Intermittent transactional emails fixed** - Retry logic handles rate limits and server errors  
✅ **Complete password reset flow** - Secure token-based reset with UI components  
✅ **Comprehensive logging** - All email attempts tracked with detailed error messages  
✅ **Immediate visibility** - Real-time monitoring and health check endpoints  
✅ **Never blocks core flows** - Graceful error handling preserves user experience  
✅ **Production ready** - Comprehensive testing and monitoring capabilities

The email system is now robust, debuggable, and production-ready with complete observability.
