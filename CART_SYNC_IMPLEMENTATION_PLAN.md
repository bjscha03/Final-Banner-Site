# Cart Persistence & Synchronization Implementation Plan

## Current State Analysis

### ✅ What's Already Implemented
1. **Database Schema**: `user_carts` table exists with basic structure
2. **Cart Store**: Zustand store with localStorage persistence
3. **Basic Sync**: `cartSync.ts` with load/save/merge functions
4. **Auth Integration**: `useCartSync` hook that triggers on login/logout
5. **Cart Ownership Tracking**: `cart_owner_user_id` in localStorage

### ❌ What's Missing or Needs Enhancement

1. **Guest Session Management**
   - No HTTP-only session cookie for guest carts
   - Guest carts only stored in localStorage (not synced to server)
   - No way to track guest carts across devices

2. **Merge Logic**
   - Current merge just deduplicates by ID
   - Doesn't deep-match items by product attributes
   - Doesn't sum quantities for matching items

3. **Cross-Device Sync**
   - No revalidation on tab focus
   - No revalidation on network reconnect
   - No polling or WebSocket for real-time updates

4. **Idempotency & Race Conditions**
   - No idempotency keys
   - No transaction support
   - Possible race conditions on rapid mutations

5. **Authorization**
   - No server-side cart API endpoints
   - All cart operations happen client-side
   - No validation that users can only access their own carts

6. **Observability**
   - Logging exists but not structured
   - No metrics/counters
   - No error tracking

## Implementation Plan

### Phase 1: Database Schema Enhancement ✅ COMPLETE

**File**: `database-migrations/enhance-user-carts.sql`

**Changes**:
- Add `session_id` column for guest cart tracking
- Add `status` column ('active', 'merged', 'abandoned')
- Add `last_accessed_at` for cleanup
- Create indexes for performance
- Add unique constraints for one active cart per user/session
- Add cleanup function for abandoned carts

### Phase 2: Enhanced Cart Sync Service

**File**: `src/lib/cartSync.ts` (enhance existing)

**New Features**:

1. **Session Management**
   ```typescript
   - getSessionId(): Get or create guest session cookie
   - clearSessionCookie(): Remove guest session on login
   ```

2. **Structured Logging**
   ```typescript
   - logEvent(data: CartEventData): Emit structured logs
   - Include requestId, userId (hashed), event type, success/failure
   ```

3. **Deep-Match Merge**
   ```typescript
   - itemsMatch(item1, item2): Compare by dimensions, material, options
   - mergeCartItems(local, server): Deep merge with quantity summing
   ```

4. **Guest-to-Auth Merge**
   ```typescript
   - mergeGuestCartOnLogin(userId): 
     * Load guest cart by session_id
     * Load user cart by user_id
     * Deep merge
     * Archive guest cart (status='merged')
     * Clear session cookie
     * Save to user account
   ```

5. **Cart Reconciliation**
   ```typescript
   - reconcileUserCarts(userId): Fix duplicate active carts
   ```

### Phase 3: Server-Side Cart API

**New Files**: `netlify/functions/cart-*.ts`

**Endpoints**:

1. **GET /cart**
   - Load cart for current user or session
   - Authorization: Check JWT or session cookie
   - Returns: CartItem[]

2. **POST /cart/add**
   - Add item to cart
   - Server-side pricing recalculation
   - Idempotency key support
   - Returns: Updated cart

3. **PUT /cart/update**
   - Update item quantity
   - Server-side pricing recalculation
   - Returns: Updated cart

4. **DELETE /cart/remove**
   - Remove item from cart
   - Returns: Updated cart

5. **POST /cart/merge**
   - Merge guest cart on login
   - Called automatically by auth flow
   - Returns: Merged cart

6. **DELETE /cart/clear**
   - Clear entire cart
   - Returns: Success

**Security**:
- Validate user can only access their own cart
- Validate session cookies
- Rate limiting
- Input sanitization

### Phase 4: Cross-Device Revalidation

**File**: `src/hooks/useCartRevalidation.ts` (new)

**Features**:
1. **Tab Focus Revalidation**
   ```typescript
   useEffect(() => {
     const handleFocus = () => revalidateCart();
     window.addEventListener('focus', handleFocus);
     return () => window.removeEventListener('focus', handleFocus);
   }, []);
   ```

2. **Network Reconnect Revalidation**
   ```typescript
   useEffect(() => {
     const handleOnline = () => revalidateCart();
     window.addEventListener('online', handleOnline);
     return () => window.removeEventListener('online', handleOnline);
   }, []);
   ```

3. **Periodic Polling** (optional)
   ```typescript
   useEffect(() => {
     const interval = setInterval(() => revalidateCart(), 30000); // 30s
     return () => clearInterval(interval);
   }, []);
   ```

### Phase 5: Idempotency & Race Protection

**Changes to Cart Store**:

1. **Idempotency Keys**
   ```typescript
   interface CartMutation {
     idempotencyKey: string;
     operation: 'add' | 'update' | 'remove';
     payload: any;
   }
   
   const pendingMutations = new Map<string, Promise<any>>();
   
   async function mutateCart(mutation: CartMutation) {
     if (pendingMutations.has(mutation.idempotencyKey)) {
       return pendingMutations.get(mutation.idempotencyKey);
     }
     
     const promise = executeCartMutation(mutation);
     pendingMutations.set(mutation.idempotencyKey, promise);
     
     try {
       return await promise;
     } finally {
       pendingMutations.delete(mutation.idempotencyKey);
     }
   }
   ```

2. **Optimistic Updates with Rollback**
   ```typescript
   async function addToCart(item: CartItem) {
     const previousState = get().items;
     
     // Optimistic update
     set({ items: [...previousState, item] });
     
     try {
       await syncToServer();
     } catch (error) {
       // Rollback on failure
       set({ items: previousState });
       throw error;
     }
   }
   ```

### Phase 6: Observability & Telemetry

**File**: `src/lib/telemetry.ts` (new)

**Features**:
1. **Structured Logging**
   ```typescript
   interface LogEvent {
     timestamp: string;
     event: string;
     userId?: string; // hashed
     sessionId?: string; // hashed
     requestId: string;
     success: boolean;
     error?: string;
     metadata?: Record<string, any>;
   }
   ```

2. **Metrics**
   ```typescript
   - cartMergeCount: Counter
   - cartMergeFailures: Counter
   - cartLoadLatency: Histogram
   - cartSaveLatency: Histogram
   - reconciliationMismatches: Counter
   ```

3. **Error Tracking**
   ```typescript
   - Capture and report errors to monitoring service
   - Include context: userId, operation, stack trace
   ```

### Phase 7: Comprehensive Testing

**Test Files**:

1. **Unit Tests**: `src/lib/__tests__/cartSync.test.ts`
   - Test deep-match logic
   - Test merge logic
   - Test session management

2. **Integration Tests**: `src/__tests__/cart-integration.test.ts`
   - Test login flow with guest cart merge
   - Test cross-device sync
   - Test race conditions

3. **E2E Tests**: `tests/e2e/cart-sync.spec.ts`
   - Test all acceptance criteria
   - Test across multiple browsers/devices

**Acceptance Tests**:
1. ✅ Persist after logout/login (same device)
2. ✅ Cross-device reload
3. ✅ Guest merge
4. ✅ Draft order recovery
5. ✅ Race condition/idempotency
6. ✅ Authorization
7. ✅ Resilience

## Implementation Order

1. ✅ Database migration (enhance-user-carts.sql)
2. 🔄 Enhance cartSync.ts with new features
3. 🔄 Create server-side cart API endpoints
4. 🔄 Update cart store to use new API
5. �� Add revalidation hooks
6. 🔄 Add idempotency protection
7. 🔄 Add telemetry
8. 🔄 Write tests
9. �� Update documentation

## Environment Variables

```env
# Cart session cookie settings
VITE_CART_SESSION_LIFETIME_DAYS=90
VITE_CART_SESSION_COOKIE_NAME=cart_session_id

# Cart sync settings
VITE_CART_SYNC_ENABLED=true
VITE_CART_REVALIDATION_INTERVAL_MS=30000

# Database
VITE_DATABASE_URL=postgresql://...
```

## Security Considerations

1. **Session Cookies**
   - HTTP-only: ✅
   - Secure (HTTPS only): ✅
   - SameSite=Lax: ✅
   - Long lifetime (90 days): ✅

2. **Authorization**
   - Users can only access their own carts
   - Session validation on every request
   - Rate limiting on cart mutations

3. **Data Privacy**
   - Hash user IDs in logs
   - Don't log PII
   - Encrypt sensitive cart data if needed

## Rollout Plan

1. **Phase 1**: Deploy database migration
2. **Phase 2**: Deploy enhanced sync service (backward compatible)
3. **Phase 3**: Deploy server-side API (optional, fallback to client)
4. **Phase 4**: Enable revalidation (feature flag)
5. **Phase 5**: Monitor metrics and errors
6. **Phase 6**: Gradually increase adoption

## Monitoring & Alerts

1. **Metrics to Track**
   - Cart merge success rate
   - Cart load/save latency
   - Cart reconciliation frequency
   - Error rates by operation

2. **Alerts**
   - Cart merge failure rate > 5%
   - Cart load latency > 2s
   - Database connection failures
   - High reconciliation rate (indicates bugs)

## Rollback Plan

If issues arise:
1. Disable server-side API (fallback to client-only)
2. Disable revalidation
3. Revert database migration (if needed)
4. Clear problematic carts and let users rebuild

## Success Criteria

1. ✅ All acceptance tests pass
2. ✅ Cart merge success rate > 95%
3. ✅ Cart load latency < 500ms (p95)
4. ✅ Zero cart data loss incidents
5. ✅ Cross-device sync works within 5 seconds
6. ✅ No duplicate cart issues
