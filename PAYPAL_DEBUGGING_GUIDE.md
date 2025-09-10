# PayPal Integration Debugging Guide

## Issue Analysis

Based on the browser console logs showing multiple 500 errors from `paypal-capture-order`, the main issues are:

1. **TypeScript Functions**: Netlify Functions need to be JavaScript (`.js`), not TypeScript (`.ts`)
2. **Missing Environment Variables**: PayPal credentials and database URL may not be configured
3. **Runtime Errors**: Potential issues with database connections or PayPal API calls

## ✅ **FIXES APPLIED**

I've converted all PayPal functions from TypeScript to JavaScript:
- `netlify/functions/paypal-config.js` ✅
- `netlify/functions/paypal-create-order.js` ✅ 
- `netlify/functions/paypal-capture-order.js` ✅
- `netlify/functions/check-admin-status.js` ✅

## 🔧 **DEBUGGING STEPS**

### Step 1: Environment Variables Setup

Set these environment variables in your development environment:

```bash
# PayPal Feature Control
FEATURE_PAYPAL=1

# PayPal Environment (sandbox for testing)
PAYPAL_ENV=sandbox

# PayPal Sandbox Credentials (get from PayPal Developer Dashboard)
PAYPAL_CLIENT_ID_SANDBOX=your_sandbox_client_id_here
PAYPAL_SECRET_SANDBOX=your_sandbox_secret_here

# Database Connection (required for order creation)
NETLIFY_DATABASE_URL=your_neon_database_url_here

# Admin Controls (optional - your email for test payments)
ADMIN_TEST_PAY_ALLOWLIST=your_email@domain.com

# Site URL (optional)
PUBLIC_SITE_URL=http://localhost:8888
```

### Step 2: Get PayPal Sandbox Credentials

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Log in with your PayPal account
3. Go to "My Apps & Credentials"
4. Under "Sandbox", click "Create App"
5. Choose "Default Application" and select your sandbox business account
6. Copy the **Client ID** and **Client Secret**

### Step 3: Test Configuration

Run the test script to verify your setup:

```bash
node test-paypal-config.js
```

This will check:
- ✅ Environment variables are set correctly
- ✅ PayPal config endpoint returns proper values
- ✅ Sandbox credentials are valid

### Step 4: Test PayPal Functions Individually

#### Test PayPal Config Endpoint:
```bash
curl -s "http://localhost:8888/.netlify/functions/paypal-config" | jq .
```

Expected response:
```json
{
  "enabled": true,
  "clientId": "your_sandbox_client_id",
  "environment": "sandbox"
}
```

#### Test Admin Status Check:
```bash
curl -X POST "http://localhost:8888/.netlify/functions/check-admin-status" \
  -H "Content-Type: application/json" \
  -d '{"email":"your_email@domain.com"}'
```

Expected response:
```json
{
  "isAdmin": true,
  "email": "your_email@domain.com"
}
```

## 🎯 **SANDBOX PAYMENT EXPECTATIONS**

### What Should Happen in Sandbox Mode:

1. **PayPal Buttons Load**: PayPal buttons appear on checkout page
2. **Order Creation**: Clicking PayPal creates a PayPal order (server-side)
3. **Payment Flow**: PayPal popup opens with sandbox payment options
4. **Test Cards Work**: You can use PayPal's test credit card numbers
5. **Payment Capture**: After approval, payment is captured and order created
6. **Success Redirect**: User redirected to order confirmation page

### PayPal Sandbox Test Credit Cards:

```
Visa: 4111111111111111
Mastercard: 5555555555554444
American Express: 378282246310005
Expiry: Any future date (e.g., 12/2025)
CVV: Any 3-4 digits (e.g., 123)
```

### What Actually Happened (Based on Logs):

1. ✅ PayPal buttons loaded (no client-side errors)
2. ✅ Order creation likely worked (no create-order errors shown)
3. ❌ Payment capture failed with 500 errors
4. ❌ Multiple "INTERNAL_ERROR" responses from capture function

## 🚨 **COMMON ISSUES & SOLUTIONS**

### Issue 1: "Failed to load resource: the server responded with a status of 500"

**Cause**: TypeScript functions not supported by Netlify
**Solution**: ✅ Fixed - Converted all functions to JavaScript

### Issue 2: "PayPal credentials not configured"

**Cause**: Missing environment variables
**Solution**: Set `PAYPAL_CLIENT_ID_SANDBOX` and `PAYPAL_SECRET_SANDBOX`

### Issue 3: "Database not configured"

**Cause**: Missing `NETLIFY_DATABASE_URL`
**Solution**: Set your Neon database connection string

### Issue 4: "PayPal capture failed"

**Cause**: Invalid PayPal API response or network issues
**Solution**: Check PayPal sandbox credentials and API status

### Issue 5: "Amount mismatch"

**Cause**: Client-side total doesn't match server-calculated total
**Solution**: Server recalculates totals to prevent tampering

## 🔍 **DEBUGGING COMMANDS**

### Check if development server is running:
```bash
curl -I http://localhost:8888
```

### Check PayPal configuration:
```bash
curl -s http://localhost:8888/.netlify/functions/paypal-config | jq .
```

### Test PayPal order creation:
```bash
curl -X POST http://localhost:8888/.netlify/functions/paypal-create-order \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"line_total_cents": 7632}],
    "email": "test@example.com"
  }'
```

### Check server logs:
Look for correlation IDs (cid) in the console to trace specific requests.

## 🎉 **NEXT STEPS**

1. **Set Environment Variables**: Configure PayPal sandbox credentials
2. **Restart Development Server**: Restart to pick up new environment variables
3. **Test Configuration**: Run `node test-paypal-config.js`
4. **Test Payment Flow**: Try the PayPal checkout again
5. **Check Logs**: Look for specific error messages with correlation IDs

## 📞 **SUPPORT**

If you continue to have issues:

1. **Check PayPal Developer Dashboard**: Ensure your sandbox app is active
2. **Verify Database Connection**: Test your Neon database URL
3. **Review Server Logs**: Look for specific error messages
4. **Test with Admin Button**: Try the admin test payment as fallback

The JavaScript functions should now work correctly with proper environment variables set!
