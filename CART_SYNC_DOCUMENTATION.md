# Cart Persistence & Synchronization Implementation

## Overview

This implementation provides robust cart persistence and per-user synchronization with the following features:

- ✅ Single active cart per authenticated user
- ✅ Session persistence across logout/login and devices
- ✅ Guest-to-authenticated cart merge with deep matching logic
- ✅ Cross-device synchronization with server as source of truth
- ✅ Idempotency and race condition protection
- ✅ Structured logging and telemetry
- ✅ Authorization and security

## Architecture

### Components

1. **cartSync.ts** - Enhanced cart synchronization service
   - Session cookie management for guest carts
   - Deep-match merge logic (matches by dimensions, material, options)
   - Structured logging with CartEvent types
   - Guest-to-authenticated merge on login
   - Idempotent save/load operations

2. **useCartSync.ts** - React hook for cart synchronization
   - Detects user login/logout
   - Triggers guest cart merge on login
   - Prevents cart leakage between users
   - Maintains cart ownership tracking

3. **useCartRevalidation.ts** - React hook for cross-device sync
   - Revalidates cart on tab focus
   - Revalidates cart on network reconnect
   - Optional periodic polling
   - Debounced revalidation to prevent excessive calls

4. **Database Schema** - Enhanced user_carts table
   - `session_id` for guest cart tracking
   - `status` for cart lifecycle (active, merged, abandoned)
   - `last_accessed_at` for cleanup
   - Unique constraints for one active cart per user/session
   - Indexes for performance

## Database Migration

### Required Migration

Run the migration to enhance the `user_carts` table:

```sql
-- See database-migrations/enhance-user-carts.sql
```

### Migration Steps

1. **Option A: Using Neon Console**
   - Log into Neon console
   - Navigate to SQL Editor
   - Copy contents of `database-migrations/enhance-user-carts.sql`
   - Execute the SQL

2. **Option B: Using Migration Script** (requires database password)
   - Set `VITE_DATABASE_URL` in `.env` with full connection string including password
   - Run: `npx tsx run-cart-migration.ts`

## Environment Variables

### Required

```bash
# Neon PostgreSQL connection string
VITE_DATABASE_URL=postgresql://username:password@host/database?sslmode=require
```

### Optional

```bash
# For Netlify Functions (if using server-side cart API)
NETLIFY_DATABASE_URL=postgresql://username:password@host/database?sslmode=require
```

## Cookie Settings

### Session Cookie

- **Name**: `cart_session_id`
- **Lifetime**: 90 days
- **Attributes**: `SameSite=Lax`, `Secure` (on HTTPS), `path=/`
- **Purpose**: Track guest carts before authentication

## How It Works

### 1. Guest User Flow

1. User visits site (not logged in)
2. `cartSyncService.getSessionId()` creates session cookie
3. Cart items stored in localStorage AND database (by session_id)
4. Cart persists across page refreshes

### 2. Login Flow

1. User logs in
2. `useCartSync` hook detects user change
3. `cartSyncService.mergeGuestCartOnLogin()` is called:
   - Loads guest cart (by session_id)
   - Loads user cart (by user_id)
   - Merges with deep matching:
     - Items with same dimensions/material/options → sum quantities
     - Unique items → added as separate line items
   - Saves merged cart to user's account
   - Archives guest cart (status = 'merged')
   - Clears session cookie
4. User sees combined cart

### 3. Cross-Device Sync

1. User logs in on Device A, adds items
2. User logs in on Device B
3. `useCartSync` loads cart from database
4. User sees same cart on both devices
5. `useCartRevalidation` keeps carts in sync:
   - When user switches back to Device A tab → revalidates
   - When network reconnects → revalidates
   - Optional: periodic polling every N seconds

### 4. Logout Flow

1. User logs out
2. Cart remains in localStorage (for next login)
3. Cart ownership tracking cleared
4. On next login, cart merges with server cart

## Deep-Match Merge Logic

Items are considered "matching" if ALL of these match:

- `width_in`
- `height_in`
- `material`
- `grommets`
- `pole_pockets`
- `pole_pocket_size`
- `rope_feet`
- `file_key` (if both have files)

When items match:
- Quantities are summed
- Server item pricing is used (authoritative)
- Line total is recalculated

When items don't match:
- Both items kept as separate line items

## Revalidation Triggers

### Tab Focus

```typescript
useCartRevalidation({
  onFocus: true,  // Revalidate when tab gains focus
});
```

### Network Reconnect

```typescript
useCartRevalidation({
  onReconnect: true,  // Revalidate when network reconnects
});
```

### Periodic Polling

```typescript
useCartRevalidation({
  pollingInterval: 30000,  // Poll every 30 seconds
});
```

### Debouncing

```typescript
useCartRevalidation({
  debounceMs: 1000,  // Wait 1 second before revalidating
});
```

## Structured Logging

All cart operations emit structured log events:

```typescript
{
  timestamp: "2025-10-15T12:34:56.789Z",
  event: "CART_MERGE",
  userId: "user_12345678...",  // Hashed for privacy
  sessionId: "session_87654321...",  // Hashed for privacy
  requestId: "req_1729000496789_1",
  itemCount: 5,
  success: true,
  metadata: {
    guestItemCount: 2,
    userItemCount: 3,
    mergedItemCount: 5,
  }
}
```

### Event Types

- `CART_INIT` - Cart initialized
- `CART_ADD` - Item added
- `CART_UPDATE` - Item updated
- `CART_REMOVE` - Item removed
- `CART_MERGE` - Carts merged
- `CART_CLEAR` - Cart cleared
- `CART_LOAD` - Cart loaded from database
- `CART_SAVE` - Cart saved to database
- `ORDER_DRAFT_RESUME` - Draft order resumed

## Security

### Authorization

- User can only access their own cart (by user_id)
- Guest can only access their own cart (by session_id)
- Session IDs are random and unpredictable
- No user can access another user's cart

### Cart Ownership Tracking

- `cart_owner_user_id` in localStorage tracks cart ownership
- If user changes, cart is immediately cleared (prevents leakage)
- Nuclear option: clear cart if ownership mismatch detected

### Session Security

- Session cookies use `SameSite=Lax` to prevent CSRF
- Session cookies use `Secure` flag on HTTPS
- Session cookies have 90-day lifetime (reasonable for cart persistence)

## Testing

### Run Tests

```bash
npm test src/lib/__tests__/cartSync.test.ts
```

### Test Coverage

- ✅ Deep-match merge logic
- ✅ Session management
- ✅ User ID management
- ✅ Idempotency
- ✅ Empty cart handling
- ✅ Line total recalculation

### Manual Testing Checklist

1. **Persist after logout/login**
   - [ ] Add items to cart
   - [ ] Log out
   - [ ] Log back in
   - [ ] Verify cart items restored

2. **Cross-device reload**
   - [ ] Add items on Device A
   - [ ] Log in on Device B
   - [ ] Verify same cart appears

3. **Guest merge**
   - [ ] Add items as guest
   - [ ] Log in
   - [ ] Verify guest items merged with user cart

4. **Tab focus revalidation**
   - [ ] Add items on Device A
   - [ ] Switch to Device B, add more items
   - [ ] Switch back to Device A tab
   - [ ] Verify cart updates within 5 seconds

5. **Network reconnect**
   - [ ] Disconnect network
   - [ ] Reconnect network
   - [ ] Verify cart revalidates

6. **No duplicate carts**
   - [ ] Log in on multiple devices
   - [ ] Verify only one active cart in database

## Troubleshooting

### Cart not persisting

1. Check database connection:
   ```bash
   grep VITE_DATABASE_URL .env
   ```

2. Check browser console for errors

3. Verify migration ran successfully:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'user_carts';
   ```

### Cart not merging on login

1. Check browser console for merge logs
2. Look for `🔄 MERGE:` log entries
3. Verify session cookie exists:
   ```javascript
   document.cookie
   ```

### Cross-device sync not working

1. Verify revalidation hook is enabled in App.tsx
2. Check browser console for revalidation logs
3. Look for `🔄 REVALIDATION:` log entries

### Database migration fails

1. Verify database URL has password
2. Check database permissions
3. Try running migration manually in Neon console

## Performance

### Database Queries

- Cart load: 1 query (indexed by user_id or session_id)
- Cart save: 1 query (upsert with ON CONFLICT)
- Cart merge: 2 queries (load guest + load user)

### Indexes

- `idx_user_carts_user_id` - Fast user cart lookup
- `idx_user_carts_session_id` - Fast guest cart lookup
- `idx_user_carts_status` - Fast active cart filtering
- `idx_user_carts_user_status` - Composite index for user + status

### Revalidation Debouncing

- Default: 1 second debounce
- Prevents excessive database queries
- Configurable via `debounceMs` option

## Future Enhancements

### Server-Side Cart API

Create Netlify Functions for cart operations:

- `GET /api/cart` - Get cart
- `POST /api/cart/add` - Add item
- `PUT /api/cart/update` - Update item
- `DELETE /api/cart/remove` - Remove item
- `POST /api/cart/merge` - Merge guest cart
- `DELETE /api/cart/clear` - Clear cart

### Optimistic Updates

- Update UI immediately
- Sync to server in background
- Rollback on failure

### Conflict Resolution

- Last-write-wins strategy
- Timestamp-based conflict detection
- User notification on conflicts

### Analytics Integration

- Send cart events to analytics service
- Track conversion funnel
- Monitor cart abandonment

## Support

For issues or questions:

1. Check browser console for error logs
2. Review structured log events
3. Verify database migration status
4. Check environment variables

## Changelog

### 2025-10-15 - Initial Implementation

- ✅ Enhanced cartSync.ts with session management
- ✅ Deep-match merge logic
- ✅ Guest-to-authenticated merge
- ✅ Cross-device revalidation
- ✅ Structured logging
- ✅ Comprehensive tests
- ✅ Database migration
- ✅ Documentation
