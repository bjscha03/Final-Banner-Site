# LinkedIn OAuth Login/Signup Fix - October 12, 2024

## Problem Identified

LinkedIn (and Google) OAuth authentication was broken after recent deployment due to two critical issues:

### Issue 1: Content Security Policy (CSP) Blocking OAuth Requests
The `netlify.toml` file's CSP `connect-src` directive was missing the LinkedIn and Google OAuth domains, causing the browser to block all API requests to:
- `https://www.linkedin.com`
- `https://api.linkedin.com`
- `https://accounts.google.com`
- `https://oauth2.googleapis.com`
- `https://www.googleapis.com`

### Issue 2: Incorrect Redirect URI (www vs apex domain)
The LinkedIn OAuth redirect URI was configured as:
```
https://www.bannersonthefly.com/.netlify/functions/linkedin-callback
```

However, the site has a forced 301 redirect from `www` to the apex domain:
```toml
[[redirects]]
  from = "https://www.bannersonthefly.com/*"
  to = "https://bannersonthefly.com/:splat"
  status = 301
  force = true
```

This caused OAuth callbacks to fail because:
1. LinkedIn redirects to `www.bannersonthefly.com`
2. Netlify immediately 301 redirects to `bannersonthefly.com`
3. OAuth code and state parameters are lost in the redirect

## Fixes Applied

### Fix 1: Updated CSP in netlify.toml
**File:** `netlify.toml` (line 123)

**Before:**
```toml
connect-src 'self' blob: https://*.paypal.com ... https://pro.ip-api.com;
```

**After:**
```toml
connect-src 'self' blob: https://*.paypal.com ... https://pro.ip-api.com https://www.linkedin.com https://api.linkedin.com https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com;
```

### Fix 2: Updated Netlify Environment Variables
Updated the redirect URIs to use the apex domain (without www):

```bash
netlify env:set LINKEDIN_REDIRECT_URI "https://bannersonthefly.com/.netlify/functions/linkedin-callback"
netlify env:set VITE_LINKEDIN_REDIRECT_URI "https://bannersonthefly.com/.netlify/functions/linkedin-callback"
```

## Files Changed
- `netlify.toml` - Added OAuth domains to CSP
- Netlify environment variables (via CLI)

## Deployment
Changes committed and pushed to GitHub:
```
Commit: ffb771d - "FIX: Add LinkedIn and Google OAuth domains to CSP connect-src"
```

Netlify will automatically deploy these changes.

## Testing Required
After deployment completes:
1. Test LinkedIn login on sign-in page
2. Test LinkedIn signup on sign-up page
3. Test Google login on sign-in page
4. Test Google signup on sign-up page
5. Verify existing users can link LinkedIn to their accounts
6. Verify new users get 10 free AI credits

## Additional Notes
- The LinkedIn OAuth functions (`linkedin-auth.ts` and `linkedin-callback.ts`) were already correctly implemented
- The Google OAuth functions (`google-auth.ts` and `google-callback.ts`) were also correctly implemented
- The issue was purely configuration-related (CSP and redirect URI)
- No code changes were needed to the OAuth implementation itself

## LinkedIn Developer Console Update Required
⚠️ **IMPORTANT:** You must also update the LinkedIn Developer Console to use the correct redirect URI:

1. Go to https://www.linkedin.com/developers/apps
2. Select your app
3. Go to "Auth" tab
4. Update "Redirect URLs" to:
   ```
   https://bannersonthefly.com/.netlify/functions/linkedin-callback
   ```
5. Remove the old `www` version if present
6. Save changes

Without this update, LinkedIn will reject the OAuth callback!

---

## UPDATE: Build Fix Applied

### Additional Issue Found
The build was failing because `GoogleButton.tsx` component was missing from the repository, even though it was referenced in `SignIn.tsx` and `SignUp.tsx`.

### Fix Applied
Created `src/components/auth/GoogleButton.tsx` component with:
- Google OAuth flow integration
- Clean Google branding with official logo
- Smooth animations and professional styling
- Support for both signin and signup modes
- Error handling and loading states

**Commit:** `6aa2c42` - "FIX: Add missing GoogleButton component"

### Deployment Status
Both fixes have been pushed to GitHub:
1. ✅ CSP updated with OAuth domains (commit ffb771d)
2. ✅ GoogleButton component added (commit 6aa2c42)

Netlify will automatically deploy these changes.
