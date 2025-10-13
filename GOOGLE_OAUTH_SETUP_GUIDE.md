# Google OAuth Setup & Fix Guide
**Date:** October 13, 2025  
**Status:** ✅ Code Fixed - Awaiting Configuration

---

## 🔴 CRITICAL BUG FIXED

### The Problem
**HTTP 405 Error: "Method not allowed"**

The Google OAuth login was failing because:
- **Frontend** (`GoogleButton.tsx`) was calling the function with **POST** method
- **Backend** (`google-auth.ts`) only accepts **GET** method
- This caused a 405 error before any OAuth flow could start

### The Fix (DEPLOYED)
✅ Changed `GoogleButton.tsx` to use `GET` method  
✅ Improved error logging in `google-auth.ts`  
✅ Added detailed environment variable validation  
✅ Better CSRF state management  

**Commit:** `a205d90` - "FIX: Google OAuth HTTP 405 error - Change POST to GET method"

---

## 📋 COMPLETE SETUP CHECKLIST

### ✅ **Step 1: Google Cloud Console Configuration**

#### 1.1 Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to: **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth 2.0 Client ID**
5. If prompted, configure the **OAuth consent screen** first (see Step 1.2)
6. Choose **Application type**: **Web application**
7. Give it a name: `Banners on the Fly - Production`

#### 1.2 Configure Authorized Origins and Redirect URIs

**Authorized JavaScript origins:**
```
https://bannersonthefly.com
```

**Authorized redirect URIs:**
```
https://bannersonthefly.com/.netlify/functions/google-callback
```

**For local development, also add:**
```
Authorized JavaScript origins:
http://localhost:8888

Authorized redirect URIs:
http://localhost:8888/.netlify/functions/google-callback
```

#### 1.3 OAuth Consent Screen

1. Go to **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace)
3. Fill in required fields:
   - **App name:** Banners on the Fly
   - **User support email:** Your email
   - **Developer contact email:** Your email
4. Add scopes:
   - `openid`
   - `profile`
   - `email`
5. Add test users (if app is in "Testing" mode):
   - Add your email and any other test accounts

#### 1.4 Save Your Credentials

After creating the OAuth client, you'll see:
- **Client ID** (ends with `.apps.googleusercontent.com`)
- **Client Secret** (starts with `GOCSPX-`)

**⚠️ SAVE THESE SECURELY - You'll need them for environment variables**

---

### ✅ **Step 2: Set Environment Variables**

#### 2.1 On Netlify (Production)

**Option A: Via Netlify UI**
1. Go to your Netlify site dashboard
2. Navigate to: **Site settings** → **Environment variables**
3. Click **Add a variable**
4. Add these three variables:

| Variable Name | Value | Example |
|---------------|-------|---------|
| `GOOGLE_CLIENT_ID` | Your Client ID | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Your Client Secret | `GOCSPX-abc123def456` |
| `GOOGLE_REDIRECT_URI` | Production callback URL | `https://bannersonthefly.com/.netlify/functions/google-callback` |

**Option B: Via Netlify CLI**
```bash
netlify env:set GOOGLE_CLIENT_ID "your-client-id.apps.googleusercontent.com"
netlify env:set GOOGLE_CLIENT_SECRET "GOCSPX-your-secret"
netlify env:set GOOGLE_REDIRECT_URI "https://bannersonthefly.com/.netlify/functions/google-callback"
```

---

## 📊 WHAT I NEED FROM YOU

To complete the setup and verify everything works, please provide:

### 1. Google Cloud Console
- [ ] Confirm you have created OAuth 2.0 credentials
- [ ] Confirm redirect URI is set to: `https://bannersonthefly.com/.netlify/functions/google-callback`

### 2. Netlify Environment Variables
- [ ] Run `netlify env:list` and confirm all 3 variables are set
- [ ] Or screenshot from Netlify UI showing the variables

### 3. Test Results (After Setup)
- [ ] Click "Continue with Google" and share any error messages
- [ ] Browser console output
- [ ] Network tab showing the `google-auth` request

---

## 🎯 NEXT STEPS

1. **Set up Google Cloud Console** (Step 1)
2. **Add environment variables to Netlify** (Step 2)
3. **Deploy is automatic** (code already pushed)
4. **Test and report results**

The code fix is already deployed. Once you add the credentials, Google login will work!
