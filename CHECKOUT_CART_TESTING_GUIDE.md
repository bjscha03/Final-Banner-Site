# Checkout Cart Persistence - Testing Guide

## Important: Why Previous Tests Failed

Your tests showed `cart_owner_user_id: 2c3822a0-949c-4e76-b9a6-3ced12c14c51` (your user ID) instead of a guest session ID. This means you were **already signed in** when you added items, so there was no "guest cart" to merge.

## Proper Testing Steps

### 1. Sign Out Completely
- Click profile → Sign Out
- Verify you're signed out

### 2. Clear Browser Data
- Open DevTools (F12)
- Application tab → Local Storage → Clear
- Close and reopen browser

### 3. Add Items as Guest
- Go to `/design`
- Upload image and configure banner
- Add to cart
- **Verify:** `cart_owner_user_id` should be `sess_...`, NOT a user UUID

### 4. Go to Checkout
- Navigate to `/checkout`
- SignUpEncouragementModal should appear

### 5. Sign In
- Click "Sign In" in modal
- Enter credentials
- Sign in

### 6. Expected Result ✅
- Redirected to `/checkout` (not home)
- Cart items still present
- Console shows successful merge

## Expected Console Logs

```
🔒 SAFETY: In checkout flow: true
✅ SAFETY: In checkout flow, preserving cart for merge
🔄 MERGE: Merging guest cart with user cart...
✅ MERGE: Merged items count: 1
```

## Common Issues

### Cart Cleared After Sign-In
**Cause:** You were already signed in when adding items.
**Solution:** Must start as a guest (signed out).

### Redirected to Home Page
**Cause:** Checkout context expired or not set.
**Solution:** Click "Sign In" from checkout modal, complete within 30 minutes.

### "Merged items count: 0"
**Cause:** No guest cart in database.
**Solution:** Verify you're signed out before adding items.
