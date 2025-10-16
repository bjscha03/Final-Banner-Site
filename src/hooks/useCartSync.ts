/**
 * Hook to sync cart when user logs in/out
 * Enhanced with guest cart merge and proper session management
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { cartSyncService } from '@/lib/cartSync';
import { useCheckoutContext } from '@/store/checkoutContext';

export function useCartSync() {
  const { user } = useAuth();
  const { loadFromServer, clearCart } = useCartStore();
  const { guestSessionId: checkoutGuestSessionId } = useCheckoutContext();
  const prevUserIdRef = useRef<string | null>(null);
  const hasMergedRef = useRef<boolean>(false);

  useEffect(() => {
    const currentUserId = user?.id || null;
    const prevUserId = prevUserIdRef.current;
    const cartOwnerId = typeof localStorage !== 'undefined' ? localStorage.getItem('cart_owner_user_id') : null;
    
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 CART SYNC HOOK: User effect triggered');
    console.log('🔍 Previous user ID:', prevUserId);
    console.log('🔍 Current user ID:', currentUserId);
    console.log('🔍 Cart owner ID:', cartOwnerId);
    console.log('🔍 User object:', user);
    console.log('🔍 User email:', user?.email);
    console.log('🔍 Has merged:', hasMergedRef.current);
    
    // NUCLEAR OPTION: If current user doesn't match cart owner, CLEAR IMMEDIATELY
    if (currentUserId && cartOwnerId && currentUserId !== cartOwnerId) {
      console.log('🚨🚨🚨 NUCLEAR CLEAR: Cart owner mismatch detected!');
      console.log('🚨 Current user:', currentUserId);
      console.log('🚨 Cart owner:', cartOwnerId);
      console.log('🚨 CLEARING CART IMMEDIATELY');
      clearCart();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cart_owner_user_id', currentUserId);
      }
      hasMergedRef.current = false;
    }
    
    // SAFETY: Clear cart IMMEDIATELY if user changed (before any async operations)
    // This prevents User B from seeing User A's cart even if database fails
    if (prevUserId && currentUserId && prevUserId !== currentUserId) {
      console.log('🚨 SAFETY CLEAR: User changed detected, clearing cart IMMEDIATELY');
      console.log('🚨 Previous user:', prevUserId);
      console.log('🚨 New user:', currentUserId);
      clearCart(); // Clear synchronously, right now
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cart_owner_user_id', currentUserId);
      }
      hasMergedRef.current = false;
    }
    
    // User changed (different user logged in)
    if (prevUserId && currentUserId && prevUserId !== currentUserId) {
      console.log('⚠️  USER CHANGED: Different user logging in');
      console.log('⚠️  Previous user:', prevUserId);
      console.log('⚠️  New user:', currentUserId);
      console.log('⚠️  Clearing localStorage cart for new user');
      
      // Clear the cart in localStorage (it belongs to the previous user)
      // The previous user's cart is already saved to Neon database
      clearCart();
      
      // Update ownership tracking
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cart_owner_user_id', currentUserId);
      }
      
      // Load the new user's cart from Neon
      console.log('👤 Loading new user cart from Neon...');
      loadFromServer();
      hasMergedRef.current = false;
    }
    
    // User logged in (from logged out state)
    if (!prevUserId && currentUserId) {
      console.log('👤 User logged in from logged out state');
      console.log('👤 User ID:', currentUserId);
      console.log('👤 User email:', user?.email);
      console.log('👤 Cart owner ID:', cartOwnerId);
      
      // CRITICAL: Check if cart belongs to this user
      if (cartOwnerId && cartOwnerId !== currentUserId) {
        console.log('🚨 CRITICAL: Cart belongs to different user!');
        console.log('🚨 Cart owner:', cartOwnerId);
        console.log('🚨 Current user:', currentUserId);
        console.log('🚨 CLEARING CART NOW');
        clearCart();
      }
      
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cart_owner_user_id', currentUserId);
      }
      
      // Merge guest cart with user cart on login
      if (!hasMergedRef.current) {
        console.log('🔄 MERGE: Merging guest cart with user cart...');
        console.log('🔄 MERGE: Checkout guest session ID:', checkoutGuestSessionId ? `${checkoutGuestSessionId.substring(0, 12)}...` : 'none');
        hasMergedRef.current = true;
        
        (async () => {
          try {
            // Use checkout context session ID if available (user came from checkout)
            // This ensures we merge the correct guest cart even if cookies were cleared
            const sessionIdToUse = checkoutGuestSessionId || cartSyncService.getSessionId();
            console.log('🔄 MERGE: Using session ID:', sessionIdToUse ? `${sessionIdToUse.substring(0, 12)}...` : 'current');
            
            const mergedItems = await cartSyncService.mergeGuestCartOnLogin(
              currentUserId,
              checkoutGuestSessionId || undefined
            );
            console.log('✅ MERGE: Guest cart merged successfully');
            console.log('✅ MERGE: Merged items count:', mergedItems.length);
            
            // Update the store with merged items
            useCartStore.setState({ items: mergedItems });
          } catch (error) {
            console.error('❌ MERGE: Failed to merge guest cart:', error);
            // Fallback: just load user's cart
            loadFromServer();
          }
        })();
      } else {
        console.log('👤 About to call loadFromServer()...');
        loadFromServer();
        console.log('✅ loadFromServer() called');
      }
    }
    
    // User logged out
    if (prevUserId && !currentUserId) {
      console.log('🚪 User logged out');
      console.log('🚪 Saving cart to database before logout...');
      
      // CRITICAL FIX: Save cart to database before user logs out
      // This ensures the cart is persisted and will be available when they log back in
      const currentItems = useCartStore.getState().items;
      if (currentItems.length > 0) {
        console.log('🚪 Saving', currentItems.length, 'items to database for user:', prevUserId);
        cartSyncService.saveCart(currentItems, prevUserId).then((success) => {
          if (success) {
            console.log('✅ Cart saved successfully before logout');
          } else {
            console.error('❌ Failed to save cart before logout');
          }
        });
      }
      
      console.log('🚪 Cart will remain in localStorage for next login');
      console.log('🚪 Removing cart ownership tracking');
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
      }
      hasMergedRef.current = false;
      // DO NOT clear cart - it should persist in localStorage
      // When user logs back in, it will merge with server cart
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('🔍 Updated prevUserIdRef to:', currentUserId);
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
