/**
 * Hook to sync cart when user logs in/out
 * Enhanced with guest cart merge and proper session management
 * CRITICAL: Ensures cart is saved to database before logout and loaded on login
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
  const isSavingRef = useRef<boolean>(false);

  useEffect(() => {
    const currentUserId = user?.id || null;
    const prevUserId = prevUserIdRef.current;
    const cartOwnerId = typeof localStorage !== 'undefined' ? localStorage.getItem('cart_owner_user_id') : null;
    
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 CART SYNC HOOK: User effect triggered');
    console.log('🔍 Previous user ID:', prevUserId);
    console.log('🔍 Current user ID:', currentUserId);
    console.log('🔍 Cart owner ID:', cartOwnerId);
    console.log('🔍 Has merged:', hasMergedRef.current);
    
    // IMPROVED: Only clear if cart explicitly belongs to a DIFFERENT user
    // Don't clear if cartOwnerId is null (cart was cleared on logout)
    if (currentUserId && cartOwnerId && currentUserId !== cartOwnerId) {
      console.log('⚠️  CART OWNERSHIP: Cart belongs to different user');
      console.log('⚠️  Cart owner:', cartOwnerId);
      console.log('⚠️  Current user:', currentUserId);
      console.log('⚠️  Clearing cart and will load from server');
      clearCart();
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
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
      clearCart();
      
      // Remove the old cart owner ID
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
      }
      
      // Load the new user's cart from database
      console.log('👤 Loading new user cart from database...');
      loadFromServer();
      hasMergedRef.current = false;
      
      // Update ref and exit early
      prevUserIdRef.current = currentUserId;
      console.log('═══════════════════════════════════════════════');
      return;
    }
    
    // User logged in (from logged out state)
    if (!prevUserId && currentUserId) {
      console.log('👤 User logged in from logged out state');
      console.log('👤 User ID:', currentUserId);
      console.log('👤 Cart owner ID:', cartOwnerId);
      
      // Only clear if cart explicitly belongs to a DIFFERENT user
      if (cartOwnerId && cartOwnerId !== currentUserId) {
        console.log('🚨 CRITICAL: Cart belongs to different user!');
        console.log('🚨 Cart owner:', cartOwnerId);
        console.log('🚨 Current user:', currentUserId);
        console.log('🚨 CLEARING CART NOW');
        clearCart();
      }
      
      // Merge guest cart with user cart on login
      // CRITICAL FIX: Only merge if there's actually a guest session to merge
      // Otherwise just load the user's cart from the database
      const hasGuestSession = checkoutGuestSessionId || (typeof document !== 'undefined' && document.cookie.includes('guest_session_id'));
      
      if (hasGuestSession && !hasMergedRef.current) {
        console.log('🔄 MERGE: Guest session detected, merging guest cart with user cart...');
        hasMergedRef.current = true;
        
        (async () => {
          try {
            console.log('🔄 MERGE: Calling mergeGuestCartOnLogin...');
            
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
        console.log('👤 No guest session detected, loading user cart from database...');
        hasMergedRef.current = false;
        loadFromServer();
      }
        hasMergedRef.current = false;
        loadFromServer();
      }
    
    // User logged out
    if (prevUserId && !currentUserId) {
      console.log('🚪 User logged out');
      console.log('🚪 CRITICAL: Saving cart to database before clearing...');
      
      // CRITICAL FIX: Save cart to database BEFORE clearing
      // This ensures the cart is persisted and will be available when they log back in
      const currentItems = useCartStore.getState().items;
      
      if (currentItems.length > 0 && !isSavingRef.current) {
        isSavingRef.current = true;
        console.log('🚪 Saving', currentItems.length, 'items to database for user:', prevUserId);
        
        // Save to database (fire and forget, but log results)
        cartSyncService.saveCart(currentItems, prevUserId)
          .then((success) => {
            if (success) {
              console.log('✅ Cart saved successfully to database before logout');
            } else {
              console.error('❌ Failed to save cart to database before logout');
            }
          })
          .catch((error) => {
            console.error('❌ Error saving cart to database before logout:', error);
          })
          .finally(() => {
            isSavingRef.current = false;
          });
      } else if (currentItems.length === 0) {
        console.log('ℹ️  No items to save (cart is empty)');
      }
      
      // Clear cart from UI (cart is saved to database above)
      console.log('🚪 Clearing cart from UI');
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
      }
      hasMergedRef.current = false;
      clearCart();
      console.log('✅ Cart cleared from UI - will be restored from database on next login');
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('🔍 Updated prevUserIdRef to:', currentUserId);
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
