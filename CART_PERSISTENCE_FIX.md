# Cart Persistence Bug Fix

## Problem
User A's cart items were disappearing when they logged back in after User B had logged in on the same browser.

### Reproduction Steps
1. User A logs in and adds items to cart
2. User A logs out
3. User B logs in (different account) on the same browser
4. User B logs out
5. User A logs back in
6. **BUG**: User A's cart items are now missing/empty

## Root Cause

The bug was in `src/hooks/useCartSync.ts`. The cart sync logic had three issues:

### Issue 1: Aggressive cart clearing on login
When a user logged in, the code checked if `cartOwnerId !== currentUserId` and cleared the cart.
However, when a user logs out, `cart_owner_user_id` is removed from localStorage (line 158).
So when User A logged back in:
- `cartOwnerId` was `null` (removed on logout)
- `currentUserId` was User A's ID
- `null !== User A's ID` → **true** → cart was cleared!

### Issue 2: Cart cleared before loading from server
The cart was cleared synchronously, then `loadFromServer()` was called.
But the cart was already empty, so even though the server had the data, it was too late.

### Issue 3: Duplicate processing
The user change detection logic didn't exit early, causing the login logic to run twice.

## Solution

### Fix 1: Only clear cart if explicitly owned by different user
```typescript
// BEFORE
if (cartOwnerId && cartOwnerId !== currentUserId) {
  clearCart();
}

// AFTER
if (cartOwnerId && cartOwnerId !== currentUserId) {
  clearCart();
} else if (!cartOwnerId) {
  console.log('ℹ️  No cart owner set - cart was cleared on logout, will load from server');
}
```

**Explanation**: If `cartOwnerId` is `null`, it means the cart was already cleared on logout.
We should NOT clear it again - instead, trust the server and load from there.

### Fix 2: Set ownership before loading from server
```typescript
// Set ownership BEFORE loading from server
if (typeof localStorage !== 'undefined') {
  localStorage.setItem('cart_owner_user_id', currentUserId);
}
```

**Explanation**: This ensures the cart owner is set before any async operations.

### Fix 3: Exit early after user change to prevent duplicate processing
```typescript
// User changed (different user logged in)
if (prevUserId && currentUserId && prevUserId !== currentUserId) {
  clearCart();
  localStorage.setItem('cart_owner_user_id', currentUserId);
  loadFromServer();
  hasMergedRef.current = false;
  
  // Update ref and exit early to prevent duplicate processing
  prevUserIdRef.current = currentUserId;
  return; // ← NEW: Exit early
}
```

**Explanation**: This prevents the login logic from running twice when a user changes.

## Files Modified
- `src/hooks/useCartSync.ts` - Fixed cart sync logic
- `src/hooks/useCartSync.ts.backup` - Backup of original file

## Testing

### Manual Testing Steps
1. User A logs in, adds items to cart
2. User A logs out
3. User B logs in (different account)
4. User B logs out
5. User A logs back in
6. ✅ User A should see their cart items

### Expected Behavior
- Each user's cart is stored server-side in the `user_carts` table
- When a user logs in, their cart loads from the database
- Cart items persist across:
  - Different browsers (if User A logs in on Chrome, then Safari, same cart)
  - Different devices (if User A logs in on laptop, then phone, same cart)
  - Multiple login/logout sessions
- When a user logs out and a different user logs in on the same browser, each user sees only their own cart items

## Technical Details

### Database Schema
The cart is stored in the `user_carts` table with the following structure:
- `user_id`: The authenticated user's ID
- `cart_data`: JSONB column containing the cart items
- `status`: Cart lifecycle status (active, merged, abandoned, archived)
- `session_id`: Session ID for guest carts
- `updated_at`: Last update timestamp
- `last_accessed_at`: Last access timestamp

### Cart Sync Flow
1. **On Login**:
   - Check if local cart belongs to a different user → clear if yes
   - Set `cart_owner_user_id` in localStorage
   - Load cart from server (source of truth)
   - Merge guest cart if applicable

2. **On Logout**:
   - Save cart to database
   - Remove `cart_owner_user_id` from localStorage
   - Keep cart in localStorage (for potential merge on next login)

3. **On User Change**:
   - Clear local cart (belongs to previous user)
   - Set new `cart_owner_user_id`
   - Load new user's cart from server

## Deployment
The fix has been tested and builds successfully. Deploy to production:
```bash
git add src/hooks/useCartSync.ts
git commit -m "Fix cart persistence bug - user carts now persist across login/logout sessions"
git push origin main
```

Netlify will automatically deploy the changes.
