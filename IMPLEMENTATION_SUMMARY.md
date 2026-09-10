# Email-Capture Discount Popup - Implementation Summary

## What Changed

### ❌ Removed
- Video element and all video-related code
- Inline discount code display (WELCOME20 hardcoded)
- Video autoplay, mute controls, Cloudinary video URL
- ~2MB video asset loading on every popup view

### ✅ Added
- Email capture form with privacy consent
- Unique code generation per email (WELCOME20-XXXXXXXX format)
- **Immediate code display after submission** with Copy and Apply buttons
- Email delivery as backup (Postmark integration)
- Exit-intent trigger with 72-hour cooldown
- Rate limiting (3 codes per IP per day)
- Email-based validation at checkout
- Database tracking of email captures and code usage
- GA4 analytics events

## Files Modified

1. **src/components/PromoPopup.tsx** - Complete rewrite
   - Removed video player
   - Added email form with validation
   - Added success state showing code immediately
   - Added Copy and Apply at Checkout buttons
   - Integrated with cart store for auto-apply

2. **src/hooks/usePromoPopup.ts** - Enhanced logic
   - Added exit-intent detection (desktop only)
   - Added 72-hour cooldown after dismissal
   - Track email_captured state
   - Support both first_visit and exit_intent sources

3. **src/App.tsx** - Minor update
   - Pass `popupSource` prop to PromoPopup component

4. **.env.example** - Added email config
   - POSTMARK_API_KEY
   - POSTMARK_FROM_EMAIL
   - Alternative providers (Mailgun, SendGrid)

## Files Created

1. **migrations/008_email_capture_discount_system.sql**
   - email_captures table
   - discount_codes schema updates (email, status, issued_at, etc.)
   - Helper functions: get_or_create_discount_code, mark_discount_code_used
   - Rate limiting function: check_ip_rate_limit
   - Expiration function: expire_old_discount_codes

2. **netlify/functions/send-discount-code.cjs**
   - Email validation
   - Rate limiting (max 3/day per IP)
   - Unique code generation
   - Database storage
   - Postmark email sending
   - Resend logic (same code if requested within 24h)

3. **EMAIL_DISCOUNT_SETUP.md**
   - Complete setup guide
   - Testing checklist (10 test scenarios)
   - Database queries for monitoring
   - Troubleshooting guide
   - Rollback plan

## User Flow Changes

### Before (Old Flow)
1. Popup shows after 11 seconds
2. Video plays automatically
3. Code "WELCOME20" shown inline
4. User copies code manually
5. User navigates to design page
6. User applies code at checkout

### After (New Flow)
1. Popup shows after 11 seconds (or on exit-intent)
2. User enters email + accepts privacy policy
3. User clicks "Email Me the Code"
4. **Code immediately displayed in popup**
5. User can:
   - Click "Copy Code" → code in clipboard
   - Click "Apply at Checkout" → auto-applies code and navigates to /design
6. Email sent to user's inbox as backup
7. At checkout, code validated against email

## Key Features

### Immediate Code Display
- Code shown right away in popup (no waiting for email)
- Large, prominent display
- Copy button for easy clipboard access
- Apply button for one-click redemption
- Email is backup/confirmation, not primary delivery

### Security & Anti-Abuse
- Rate limiting: 3 codes per IP per day
- Email validation (RFC 5322)
- Single-use per email
- Email must match at checkout
- 14-day expiration
- Status tracking (unused/used/expired)

### User Experience
- No video loading (faster popup)
- Exit-intent fallback if dismissed
- 72-hour cooldown after dismissal
- Resend same code if requested again within 24h
- Privacy policy consent required

### Analytics
- discount_popup_shown
- discount_email_submitted
- discount_email_sent
- discount_code_copied
- discount_code_apply_clicked

## Database Schema

### email_captures
- Tracks all email submissions
- Fields: email, consent, source, ip, user_agent, captured_at

### discount_codes (updated)
- New fields: email, status, issued_at, used_at, issued_ip, campaign
- Status: unused | used | expired
- Campaign: popup_first_visit | popup_exit_intent

## Next Steps

1. **Deploy to Netlify**
   ```bash
   git add .
   git commit -m "Upgrade promo popup: remove video, add email-capture with immediate code display"
   git push origin main
   ```

2. **Run Database Migration**
   - Open Neon SQL Editor
   - Run `migrations/008_email_capture_discount_system.sql`

3. **Configure Postmark**
   - Sign up at postmarkapp.com
   - Get Server API Token
   - Add to Netlify env vars:
     - POSTMARK_API_KEY
     - POSTMARK_FROM_EMAIL

4. **Test**
   - Follow EMAIL_DISCOUNT_SETUP.md testing checklist
   - Verify popup shows without video
   - Verify email capture works
   - Verify code displays immediately
   - Verify email received
   - Verify checkout validation

## Rollback

If issues arise:
```bash
git revert HEAD
git push origin main
```

Or restore from backups:
- /tmp/PromoPopup_backup.tsx
- /tmp/usePromoPopup_backup.ts
- /tmp/App_backup.tsx

## Performance Impact

- **Faster popup load**: No 2MB video download
- **Async email**: Doesn't block response
- **Indexed queries**: Fast email/code lookups
- **Rate limiting**: Prevents abuse/spam

## Compliance

- Privacy policy consent required
- Email opt-in explicit
- GDPR-friendly (consent checkbox)
- CAN-SPAM compliant (transactional email)
- Unsubscribe not required (single transactional email)

