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
- ✅ Email delivery as backup (Postmark)
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

### 2. Set Up Postmark

1. Sign up at https://postmarkapp.com (free tier: 100 emails/month)
2. Create a server
3. Get your **Server API Token** from Settings
4. Verify sender signature for `noreply@bannersonthefly.com`:
   - Go to Sender Signatures
   - Add `noreply@bannersonthefly.com`
   - Verify via email or DNS

### 3. Configure Netlify Environment Variables

In Netlify dashboard → Site Settings → Environment Variables, add:

```
POSTMARK_API_KEY=your_server_api_token_here
POSTMARK_FROM_EMAIL=noreply@bannersonthefly.com
```

**Important:** These must be set BEFORE deploying!

---

## 🚢 Deployment

### Option 1: Push to GitHub (Recommended)

```bash
# Already committed, just push
git push origin main
```

Netlify will automatically deploy.

### Option 2: Manual Deploy

If you need to deploy manually:

```bash
npm run build
# Then drag dist/ folder to Netlify dashboard
```

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

## 🧪 Manual Testing Checklist

Use the comprehensive test plan in `IMPLEMENTATION_SUMMARY.md`:

- [ ] First-visit popup shows (no video)
- [ ] Email submission works
- [ ] Code displays immediately in popup
- [ ] Email received in inbox
- [ ] Copy Code button works
- [ ] Apply at Checkout button works
- [ ] Code validates at checkout
- [ ] Single-use enforcement works
- [ ] Resend logic works (same code within 24h)
- [ ] Exit-intent trigger works
- [ ] 72-hour cooldown works
- [ ] Rate limiting works (3 per IP per day)
- [ ] Email validation works
- [ ] Privacy consent required
- [ ] Code expiration works (14 days)
- [ ] Email mismatch rejected
- [ ] GA4 events fire
- [ ] No video assets loaded

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
- `[send-discount-code] Email sent: email@example.com`

### Postmark Dashboard

Monitor email delivery:
- Sent emails count
- Bounce rate (should be 0%)
- Spam complaints (should be 0%)

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

### Popup Not Showing

**Check:**
- localStorage flags: `first_visit_seen`, `email_captured`, `popup_dismissed_until`
- Clear localStorage and try again
- Check browser console for errors

**Fix:**
```javascript
// In browser console
localStorage.clear();
location.reload();
```

### Email Not Received

**Check:**
1. Postmark dashboard → Activity
2. Netlify function logs for errors
3. Spam folder
4. Sender signature verified

**Common Issues:**
- `POSTMARK_API_KEY` not set → Check Netlify env vars
- Sender not verified → Verify in Postmark dashboard
- Email bounced → Check Postmark activity log

### Code Not Validating

**Check:**
1. Code exists in database:
```sql
SELECT * FROM discount_codes WHERE code = 'WELCOME20-XXX';
```

2. Code status is 'unused'
3. Code not expired (expires_at > NOW())
4. Email matches user's email

**Fix:**
- If code marked 'used' incorrectly, reset:
```sql
UPDATE discount_codes 
SET status = 'unused', used_at = NULL
WHERE code = 'WELCOME20-XXX';
```

### Rate Limit Issues

**Check:**
```sql
SELECT * FROM discount_codes 
WHERE issued_ip = 'YOUR_IP' 
AND issued_at > NOW() - INTERVAL '24 hours';
```

**Fix (for testing only):**
```sql
DELETE FROM discount_codes 
WHERE issued_ip = 'YOUR_IP' 
AND status = 'unused';
```

---

## 🔄 Rollback Plan

If critical issues arise:

### Option 1: Git Revert

```bash
git revert HEAD
git push origin main
```

### Option 2: Restore from Backups

Backups were created at:
- `/tmp/PromoPopup_backup.tsx`
- `/tmp/usePromoPopup_backup.ts`
- `/tmp/App_backup.tsx`

```bash
cp /tmp/PromoPopup_backup.tsx src/components/PromoPopup.tsx
cp /tmp/usePromoPopup_backup.ts src/hooks/usePromoPopup.ts
cp /tmp/App_backup.tsx src/App.tsx
git add src/
git commit -m "Rollback to video popup"
git push origin main
```

**Note:** Database changes are backward compatible. Old codes will continue to work.

---

## 📈 Expected Results

### Performance Improvements
- **Popup load time:** ~2MB faster (no video)
- **First paint:** Instant (no asset loading)
- **Email delivery:** <1 second

### Conversion Improvements
- **Email capture rate:** 10-15% (industry average)
- **Code usage rate:** 30-40% (of captured emails)
- **Exit-intent recovery:** 5-10% additional captures

### Cost
- **Postmark:** Free tier (100 emails/month)
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

## 📞 Support

If you encounter issues:

1. Check Netlify function logs
2. Check Postmark activity log
3. Check Neon database logs
4. Review browser console errors
5. Test in incognito mode

**Common Questions:**

**Q: Can I use a different email provider?**
A: Yes! The code supports Mailgun and SendGrid. Update `send-discount-code.cjs` and swap the email function.

**Q: Can I change the discount percentage?**
A: Yes! Update the `v_discount_percentage` variable in the `get_or_create_discount_code()` function.

**Q: Can I change the code format?**
A: Yes! Update the code generation logic in `get_or_create_discount_code()`. Current format: `WELCOME20-XXXXXXXX`

**Q: Can I change the expiration period?**
A: Yes! Update `v_expires_at := NOW() + INTERVAL '14 days'` in the database function.

---

## ✅ Deployment Complete!

Once all tests pass, your email-capture discount popup is live! 🎉

**Next Steps:**
1. Monitor email capture rate
2. Track code usage
3. Optimize popup timing if needed
4. A/B test different copy/offers
5. Consider adding SMS option for higher conversion

Good luck! 🚀
