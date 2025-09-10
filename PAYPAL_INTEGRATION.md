# PayPal Integration Implementation

## Overview

This document describes the complete PayPal integration implementation for the custom banners e-commerce application. The integration follows a feature flag approach that preserves all existing functionality while adding live PayPal payments.

## Architecture

### Feature Flag System
- **Primary Flag**: `FEATURE_PAYPAL=1` enables/disables PayPal functionality
- **Admin Controls**: `ADMIN_TEST_PAY_ALLOWLIST` controls admin test payment access
- **Graceful Degradation**: System functions normally with `FEATURE_PAYPAL=0`

### Components

#### 1. Server-Side Functions (Netlify Functions)

**`netlify/functions/paypal-config.ts`**
- Returns public PayPal configuration (client ID, environment)
- Never exposes secrets or sensitive data
- Respects feature flag settings

**`netlify/functions/paypal-create-order.ts`**
- Creates PayPal orders with server-side validation
- Recalculates totals to prevent tampering
- Supports feature flag pricing (minimum orders, free shipping)
- Returns PayPal order ID for client-side approval

**`netlify/functions/paypal-capture-order.ts`**
- Captures approved PayPal payments
- Verifies payment amounts match server calculations
- Creates orders in database with PayPal metadata
- Implements idempotency to prevent duplicate orders

#### 2. Client-Side Components

**`src/lib/paypal.ts`**
- PayPal utility functions and type definitions
- Server-side only functions (never expose secrets)
- Feature flag helpers

**`src/components/checkout/PayPalCheckout.tsx`**
- Enhanced PayPal checkout component
- Dynamic configuration loading
- Admin test payment functionality
- Comprehensive error handling and loading states

#### 3. Updated Core Files

**`src/lib/pricing.ts`**
- Added PayPal feature flag support
- Enhanced feature flag system

**`src/pages/Checkout.tsx`**
- Updated payment success handler for new flow
- Simplified order creation (handled by PayPal capture)

## Environment Variables

### Required for Production

```bash
# PayPal Configuration
FEATURE_PAYPAL=1
PAYPAL_ENV=live  # or 'sandbox' for testing

# Live Environment
PAYPAL_CLIENT_ID_LIVE=your_live_client_id
PAYPAL_SECRET_LIVE=your_live_secret

# Sandbox Environment (for testing)
PAYPAL_CLIENT_ID_SANDBOX=your_sandbox_client_id
PAYPAL_SECRET_SANDBOX=your_sandbox_secret

# Admin Controls
ADMIN_TEST_PAY_ALLOWLIST=admin@company.com,test@company.com
```

### Development Setup

```bash
# For development/testing
FEATURE_PAYPAL=1
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID_SANDBOX=your_sandbox_client_id
PAYPAL_SECRET_SANDBOX=your_sandbox_secret
ADMIN_TEST_PAY_ALLOWLIST=your_email@domain.com
```

## Security Features

### 1. Server-Side Validation
- All payment amounts recalculated server-side
- PayPal secrets never exposed to client
- Correlation IDs for request tracking

### 2. Idempotency
- Duplicate order prevention using PayPal order IDs
- Safe retry mechanisms

### 3. Admin Controls
- Email-based admin allowlist
- Test payment functionality preserved
- Feature flag protection

## User Experience

### 1. PayPal Enabled Flow
1. User adds items to cart
2. Proceeds to checkout
3. PayPal buttons load dynamically
4. User approves payment with PayPal
5. Server captures payment and creates order
6. User redirected to order confirmation

### 2. PayPal Disabled Flow
1. Same as above through step 2
2. PayPal unavailable message shown
3. Admin users see test payment button
4. Regular users see contact information

### 3. Admin Test Flow
1. Admin users always see test payment option
2. Test payments create orders without processing payments
3. Uses existing create-order endpoint
4. Maintains all existing functionality

## Error Handling

### 1. Network Errors
- Graceful fallback to disabled state
- Clear error messages to users
- Comprehensive logging

### 2. Payment Failures
- PayPal-specific error handling
- Amount verification failures
- Timeout handling

### 3. Configuration Errors
- Missing environment variables
- Invalid PayPal credentials
- Feature flag misconfigurations

## Testing Strategy

### 1. Sandbox Testing
- Use PayPal sandbox environment
- Test all payment scenarios
- Verify order creation and email notifications

### 2. Feature Flag Testing
- Test with `FEATURE_PAYPAL=0` (disabled)
- Test with `FEATURE_PAYPAL=1` (enabled)
- Verify admin controls work correctly

### 3. Error Scenario Testing
- Network failures
- Invalid payments
- Configuration errors

## Deployment Checklist

### 1. Environment Variables
- [ ] Set `FEATURE_PAYPAL=1` in production
- [ ] Configure live PayPal credentials
- [ ] Set admin allowlist emails
- [ ] Verify all other feature flags

### 2. Testing
- [ ] Test sandbox payments work
- [ ] Test admin test payments work
- [ ] Test with PayPal disabled
- [ ] Verify order creation and emails

### 3. Monitoring
- [ ] Monitor PayPal API responses
- [ ] Track correlation IDs in logs
- [ ] Monitor order creation success rates

## Maintenance

### 1. PayPal API Updates
- Monitor PayPal API changes
- Update SDK versions as needed
- Test thoroughly after updates

### 2. Feature Flag Management
- Document all feature flag changes
- Test combinations thoroughly
- Maintain backward compatibility

### 3. Security Updates
- Regularly rotate PayPal secrets
- Monitor for security advisories
- Update dependencies regularly

## Troubleshooting

### Common Issues

1. **PayPal buttons not loading**
   - Check `FEATURE_PAYPAL` flag
   - Verify client ID configuration
   - Check browser console for errors

2. **Payment amount mismatches**
   - Server recalculates all totals
   - Check feature flag pricing settings
   - Verify tax calculations

3. **Orders not created**
   - Check database connectivity
   - Verify PayPal capture response
   - Check correlation IDs in logs

### Debug Information

- All PayPal operations include correlation IDs
- Comprehensive logging at each step
- Error responses include debug information
- Admin users get additional debug info

## Future Enhancements

1. **Webhook Integration** (Optional Phase 8)
   - PayPal webhook handling
   - Payment status updates
   - Dispute management

2. **Enhanced Admin Controls**
   - Admin dashboard for PayPal settings
   - Payment analytics
   - Refund management

3. **Additional Payment Methods**
   - Credit card processing
   - Apple Pay / Google Pay
   - Buy now, pay later options
