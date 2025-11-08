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
  
  const prevUserIdRef = useRef<string | null>(null);
  const hasMergedRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);

  useEffect(() => {
    const currentUserId = user?.id || null;
    const prevUserId = prevUserIdRef.current;
    const cartOwnerId = typeof localStorage !== 'undefined' ? localStorage.getItem('cart_owner_user_id') : null;
    
    // CRITICAL FIX: Read checkout context INSIDE useEffect to get latest value
    let checkoutGuestSessionId: string | null = null;
    let clearCheckoutContext: (() => void) | undefined;
    
    try {
      const checkoutState = useCheckoutContext.getState();
      checkoutGuestSessionId = checkoutState?.guestSessionId ?? null;
      clearCheckoutContext = checkoutState?.clearCheckoutContext;
      
      console.log('🔍 CART SYNC: Checkout context state:', {
        checkoutGuestSessionId: checkoutGuestSessionId ? `${checkoutGuestSessionId.substring(0, 12)}...` : 'null',
        isInCheckoutFlow: checkoutState?.isInCheckoutFlow,
        returnUrl: checkoutState?.returnUrl,
      });
    } catch (error) {
      console.error('CART SYNC HOOK: Error accessing checkout context:', error);
      checkoutGuestSessionId = null;
      clearCheckoutContext = () => {};
    }
    
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 CART SYNC HOOK: User effect triggered');
    console.log('🔍 Previous user ID:', prevUserId);
    console.log('🔍 Current user ID:', currentUserId);
    console.log('🔍 Cart owner ID:', cartOwnerId);
    console.log('🔍 Has merged:', hasMergedRef.current);
    console.log('🔍 Checkout guest session ID:', checkoutGuestSessionId ? `${checkoutGuestSessionId.substring(0, 12)}...` : 'null');
    
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
        console.log('🔍 CART OWNERSHIP: Cart belongs to different user, will load from server');
        console.log('🔍 Cart owner:', cartOwnerId);
        console.log('🔍 Current user:', currentUserId);
      }
      
      // ALWAYS attempt to merge guest cart on login
      // This ensures guest cart items are never lost, even if checkout context is missing
      console.log('🔄 CART SYNC: Attempting guest cart merge on login...');
      console.log('🔄 Checkout context guest session ID:', checkoutGuestSessionId ? `${checkoutGuestSessionId.substring(0, 12)}...` : 'null');
      
      if (!hasMergedRef.current) {
        hasMergedRef.current = true;
        
        // Set loading state to prevent "cart is empty" flash
        useCartStore.setState({ isLoading: true });
        
        (async () => {
          try {
            console.log('🔄 MERGE: Calling mergeGuestCartOnLogin...');
            console.log('🔄 MERGE: This will check for guest cart in database and merge if found');
            
            // mergeGuestCartOnLogin will:
            // 1. Try to get session ID from checkoutGuestSessionId OR cookie
            // 2. Load guest cart from database (if exists)
            // 3. Load user cart from database
            // 4. Merge them (if guest cart exists)
            // 5. Save merged cart to user's account
            const mergedItems = await cartSyncService.mergeGuestCartOnLogin(
              currentUserId,
              checkoutGuestSessionId || undefined
            );
            console.log('✅ MERGE: Guest cart merge completed');
            console.log('✅ MERGE: Merged items count:', mergedItems.length);
            
            // Update the store with merged items
            useCartStore.setState({ items: mergedItems });
            
            // Set cart owner to current user
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('cart_owner_user_id', currentUserId);
            }
            
            // Clear loading state
            useCartStore.setState({ isLoading: false });
            
            // Clear checkout context after successful merge
            if (clearCheckoutContext) {
              console.log('🧹 CART SYNC: Clearing checkout context after merge');
              clearCheckoutContext();
            }
          } catch (error) {
            console.error('❌ MERGE: Failed to merge guest cart:', error);
            // Clear loading state
            useCartStore.setState({ isLoading: false });
            // Fallback: just load user's cart
            loadFromServer();
          }
        })();
      }
    }
    
    // User logged out
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
      console.log('✅ Cart cleared from UI - will be restored from database on next login');
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('🔍 Updated prevUserIdRef to:', currentUserId);
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
