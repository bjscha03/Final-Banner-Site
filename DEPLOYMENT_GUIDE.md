# 🚀 Deployment Guide - Email-Capture Discount Popup

## ✅ What Was Changed

### Removed
- ❌ Video element (2MB asset)
- ❌ Hardcoded "WELCOME20" inline display
- ❌ Video autoplay, mute controls

### Added
- ✅ Email capture form with privacy consent
- ✅ Unique code generation per email (WELCOME20-XXXXXXXX)
- ✅ **Immediate code display** in popup after submission
- ✅ Copy Code and Apply at Checkout buttons
- ✅ Email delivery as backup (Resend)
- ✅ Exit-intent trigger with 72-hour cooldown
- ✅ Rate limiting (3 codes per IP per day)
- ✅ Email-based validation at checkout
- ✅ Database tracking of captures and usage

---

## 📋 Pre-Deployment Steps

### 1. Run Database Migration

Open your Neon SQL Editor and run:

**File:** `migrations/008_email_capture_discount_system.sql`

This creates:
- `email_captures` table
- New columns in `discount_codes` table
- Helper functions for code generation and validation

### 2. Verify Resend Configuration

You already have Resend set up! Just verify:

1. Check your Resend dashboard: https://resend.com/api-keys
2. Verify `orders@bannersonthefly.com` is a verified sender
3. Confirm `RESEND_API_KEY` is set in Netlify environment variables
4. Confirm `EMAIL_FROM=orders@bannersonthefly.com` is set

**No additional setup needed!** ✅

### 3. Netlify Environment Variables

Verify these are already set (they should be from your existing setup):

```
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=orders@bannersonthefly.com
```

---

## 🚢 Deployment

### Push to GitHub

```bash
git push origin main
```

Netlify will automatically deploy.

---

## ✅ Post-Deployment Verification

### 1. Check Netlify Build

- Go to Netlify dashboard → Deploys
- Verify build succeeded
- Check function logs for `send-discount-code`

### 2. Test the Popup

1. Open incognito window
2. Go to https://bannersonthefly.com
3. Wait 11 seconds
4. Popup should appear (no video!)
5. Enter test email
6. Code should display immediately
7. Check email inbox

### 3. Verify Database

In Neon SQL Editor:

```sql
-- Check recent email captures
SELECT email, source, captured_at
FROM email_captures
ORDER BY captured_at DESC
LIMIT 5;

-- Check recent codes
SELECT code, email, status, issued_at, expires_at
FROM discount_codes
WHERE campaign LIKE 'popup_%'
ORDER BY issued_at DESC
LIMIT 5;
```

### 4. Test Checkout Validation

1. Add banner to cart
2. Apply the code you received
3. Verify 20% discount applied
4. Complete test order
5. Try to use code again → should fail

---

## 📊 Monitoring

### Netlify Function Logs

Check logs for `send-discount-code`:

```
Netlify Dashboard → Functions → send-discount-code → Logs
```

Look for:
- `[send-discount-code] Request: {email, source, ip}`
- `[send-discount-code] Code generated: {code, isNew}`
- `[send-discount-code] Email sent via Resend: email@example.com ID: xxx`

### Resend Dashboard

Monitor email delivery at https://resend.com/emails:
- Sent emails count
- Delivery rate (should be ~100%)
- Bounce rate (should be 0%)

### Database Queries

```sql
-- Email capture rate by source
SELECT source, COUNT(*) as count
FROM email_captures
GROUP BY source;

-- Code usage stats
SELECT 
  status,
  COUNT(*) as count,
  COUNT(DISTINCT email) as unique_emails
FROM discount_codes
WHERE campaign LIKE 'popup_%'
GROUP BY status;

-- Conversion rate (used vs issued)
SELECT 
  COUNT(CASE WHEN status = 'used' THEN 1 END)::FLOAT / 
  COUNT(*)::FLOAT * 100 as conversion_rate
FROM discount_codes
WHERE campaign LIKE 'popup_%';
```

---

## 🐛 Troubleshooting

### Email Not Received

**Check:**
1. Resend dashboard → Emails
2. Netlify function logs for errors
3. Spam folder
4. Sender verified in Resend

**Common Issues:**
- `RESEND_API_KEY` not set → Check Netlify env vars
- Sender not verified → Verify in Resend dashboard
- Email bounced → Check Resend activity log

### Code Not Validating

**Check:**
1. Code exists in database:
```sql
SELECT * FROM discount_codes WHERE code = 'WELCOME20-XXX';
```

2. Code status is 'unused'
3. Code not expired (expires_at > NOW())
4. Email matches user's email

---

## 📈 Expected Results

### Performance Improvements
- **Popup load time:** ~2MB faster (no video)
- **First paint:** Instant (no asset loading)
- **Email delivery:** <1 second via Resend

### Conversion Improvements
- **Email capture rate:** 10-15% (industry average)
- **Code usage rate:** 30-40% (of captured emails)
- **Exit-intent recovery:** 5-10% additional captures

### Cost
- **Resend:** Already set up! (3,000 emails/month free tier)
- **Database:** Minimal storage (<1MB for 1000 codes)
- **Netlify Functions:** Free tier (125k requests/month)

---

## 🎯 Success Metrics

Track these in your analytics:

1. **Email Capture Rate:** emails captured / popup views
2. **Code Usage Rate:** codes used / codes issued
3. **Revenue Impact:** orders with popup codes × average order value
4. **Exit-Intent Recovery:** exit-intent captures / total captures

**Target Metrics:**
- Email capture rate: >10%
- Code usage rate: >30%
- Exit-intent recovery: >5%

---

## ✅ Ready to Deploy!

Your email-capture discount popup is ready to go live! 🎉

**Next Steps:**
1. ✅ Run database migration in Neon
2. ✅ Verify Resend is configured (already done!)
3. ✅ Push to GitHub
4. ✅ Test on live site
5. ✅ Monitor Resend dashboard for email delivery

Good luck! 🚀
