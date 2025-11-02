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
  const { guestSessionId: checkoutGuestSessionId, clearCheckoutContext } = useCheckoutContext();
  
  // DEBUG: Log checkout context state
  console.log('🔍 CART SYNC HOOK: Checkout context state:', {
    checkoutGuestSessionId: checkoutGuestSessionId ? `${checkoutGuestSessionId.substring(0, 12)}...` : 'null',
  });
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
    
    // CRITICAL: Don't clear cart - it syncs empty cart to server and DELETES the database cart!
    // Just update the cart_owner_user_id in localStorage
    if (currentUserId && cartOwnerId && currentUserId !== cartOwnerId) {
      console.log('🔍 CART OWNERSHIP: Cart belongs to different user, will load from server');
      console.log('🔍 Cart owner:', cartOwnerId);
      console.log('🔍 Current user:', currentUserId);
      // Don't call clearCart() - just remove the ownership marker
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
      // clearCart(); // DISABLED - was deleting database cart
      
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
      
      // CRITICAL: Don't clear cart here - it syncs empty cart to server and DELETES the database cart!
      // Just let loadFromServer() overwrite the cart with the correct user's cart
      if (cartOwnerId && cartOwnerId !== currentUserId) {
        console.log('�� CART OWNERSHIP: Cart belongs to different user, will load from server');
        console.log('🔍 Cart owner:', cartOwnerId);
        console.log('🔍 Current user:', currentUserId);
      }
      
      // Merge guest cart with user cart on login
      // CRITICAL FIX: Only merge if there's actually a guest session to merge
      // Otherwise just load the user's cart from the database
      const hasCookie = typeof document !== 'undefined' && document.cookie.includes('cart_session_id');
      const hasGuestSession = checkoutGuestSessionId || hasCookie;
      
      console.log('🔍 GUEST SESSION CHECK:', {
        checkoutGuestSessionId: checkoutGuestSessionId ? `${checkoutGuestSessionId.substring(0, 12)}...` : 'null',
        hasCookie,
        hasGuestSession,
      });
      
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
            
            // Clear checkout context after successful merge
            console.log('🧹 CART SYNC: Clearing checkout context after successful merge');
            clearCheckoutContext();
          } catch (error) {
            console.error('❌ MERGE: Failed to merge guest cart:', error);
            // Fallback: just load user's cart
            loadFromServer();
          }
        })();
      } else {
        // No guest session - just load user's cart from server
        // CRITICAL: Don't save local cart to server - it might belong to a different user
        // The loadFromServer() function will handle saving local cart if it belongs to current user
        console.log('👤 No guest session, loading user cart from database...');
        hasMergedRef.current = false;
        // CRITICAL FIX: Clear items SYNCHRONOUSLY before loading from server
        // This prevents loadFromServer() from seeing old user's items in get().items
        console.log('🧹 CLEARING CART: Setting items to [] before loadFromServer()');
        useCartStore.setState({ items: [] });
        
        // CRITICAL FIX: Also clear cart_owner_user_id to prevent loadFromServer() from thinking
        // the local cart belongs to the current user
        if (typeof localStorage !== 'undefined') {
          const oldOwner = localStorage.getItem('cart_owner_user_id');
          if (oldOwner && oldOwner !== currentUserId) {
            console.log('🧹 CLEARING CART OWNER: Removing old owner ID:', oldOwner);
            localStorage.removeItem('cart_owner_user_id');
          }
        }
        
        // Small delay to ensure state is cleared before loading from server
        // This prevents race condition where loadFromServer() sees old items
        setTimeout(() => {
          console.log('📥 LOADING FROM SERVER: After clearing cart');
          loadFromServer();
        }, 50);
      }
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
      useCartStore.setState({ items: [] });
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
      }
      hasMergedRef.current = false;
      // // clearCart(); // DISABLED - was deleting database cart // DISABLED - was deleting database cart
      console.log('✅ Cart cleared from UI - will be restored from database on next login');
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('🔍 Updated prevUserIdRef to:', currentUserId);
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
