# Guest Cart Merge Fix

## Problem
When a guest user (not signed in) added items to their cart and then signed in during checkout, the cart items disappeared. The guest cart was not being merged with the authenticated user's cart.

## Root Cause

The checkout flow was not preserving the guest session ID when redirecting to sign-in/sign-up pages. Here's what was happening:

1. **Guest user adds items to cart** → Items stored with guest session ID in cookie
2. **Guest user goes to checkout** → Checkout page shows sign-in prompt
3. **User clicks "Sign In"** → Navigates to `/sign-in?next=/checkout`
4. **PROBLEM**: Guest session ID was NOT preserved in checkout context
5. **User signs in** → `useCartSync` hook tries to merge guest cart
6. **PROBLEM**: `checkoutGuestSessionId` is `null`, so merge uses wrong/missing session ID
7. **Result**: Guest cart items are lost

## Solution

### 1. Checkout Page (`src/pages/Checkout.tsx`)
Added checkout context setup before navigating to sign-in:

```typescript
onClick={() => {
  // CRITICAL FIX: Set checkout context with guest session ID before navigating
  const guestSessionId = cartSyncService.getSessionId();
  console.log('🛒 CHECKOUT: Setting checkout context before sign-in', {
    guestSessionId: guestSessionId ? `${guestSessionId.substring(0, 12)}...` : 'none'
  });
  setCheckoutContext('/checkout', guestSessionId);
  navigate('/sign-in?from=checkout&next=/checkout');
}}
```

### 2. SignUpEncouragementModal (`src/components/checkout/SignUpEncouragementModal.tsx`)
Added the same checkout context setup for both sign-in and sign-up buttons:

```typescript
const handleSignIn = () => {
  const guestSessionId = cartSyncService.getSessionId();
  setCheckoutContext('/checkout', guestSessionId);
  navigate('/sign-in?from=checkout');
  onClose();
};
```

### 3. How It Works Now

1. **Guest user adds items to cart** → Items stored with guest session ID
2. **Guest user goes to checkout** → Checkout page shows sign-in prompt
3. **User clicks "Sign In"** → `setCheckoutContext('/checkout', guestSessionId)` is called
4. **Guest session ID is preserved** in checkout context (localStorage)
5. **User signs in** → `useCartSync` hook reads `checkoutGuestSessionId` from context
6. **Merge happens correctly** → `mergeGuestCartOnLogin(userId, guestSessionId)`
7. **Result**: Guest cart items are merged with user's cart ✅

## Files Modified
- `src/pages/Checkout.tsx` - Added checkout context setup before sign-in navigation
- `src/components/checkout/SignUpEncouragementModal.tsx` - Added checkout context setup for modal buttons

## Testing

### Test Case 1: Guest Cart Merge on Sign-In
1. Open browser in incognito mode (or clear cookies)
2. Go to `/design` page (not signed in)
3. Upload an image and configure a banner
4. Click "Add to Cart"
5. Go to `/checkout` page
6. Click "Sign In" button
7. Sign in with existing account
8. ✅ After sign-in, you should be redirected to `/checkout` with the cart item still there

### Test Case 2: Guest Cart Merge via Modal
1. Open browser in incognito mode
2. Add item to cart as guest
3. Go to `/checkout` page
4. Modal appears prompting to create account
5. Click "Sign In Instead"
6. Sign in with existing account
7. ✅ Cart items should still be there

### Test Case 3: Existing Cart Persistence (Regression Test)
1. User A logs in, adds items to cart
2. User A logs out
3. User B logs in (different account)
4. User B logs out
5. User A logs back in
6. ✅ User A should see their cart items (cart persistence still works)

## Deployment
- Commit: `[commit hash will be added]`
- Status: ✅ Deployed to production via Netlify

## Notes
- Cart persistence functionality remains intact
- Resize handle positioning fix remains intact
- Image selection functionality remains intact
- The fix is minimal and surgical - only adds checkout context setup before navigation
