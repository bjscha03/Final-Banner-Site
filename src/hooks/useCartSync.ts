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
      console.log('⚠️  CRITICAL: Clearing cart from UI BEFORE loading new user cart');
      
      // CRITICAL FIX: Clear the cart from UI FIRST to prevent cross-account pollution
      useCartStore.setState({ items: [] });
      console.log('✅ Cart cleared from UI');
      
      // Remove the old cart owner ID
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
        localStorage.setItem('cart_owner_user_id', currentUserId);
        console.log('✅ Updated cart_owner_user_id to new user:', currentUserId);
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
      
      // CRITICAL FIX: If local cart belongs to a DIFFERENT user, clear it first!
      // This prevents cross-account cart pollution
      if (cartOwnerId && cartOwnerId !== currentUserId) {
        console.log('⚠️ CROSS-ACCOUNT FIX: Local cart belongs to different user!');
        console.log('⚠️ Cart owner:', cartOwnerId);
        console.log('⚠️ Current user:', currentUserId);
        console.log('⚠️ Clearing local cart to prevent cross-account pollution');
        
        // Clear the local cart IMMEDIATELY
        useCartStore.setState({ items: [] });
        
        // Remove stale cart owner
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('cart_owner_user_id');
        }
        
        // Just load from server - don't merge
        console.log('👤 Loading user cart from server (no merge)...');
        useCartStore.setState({ isLoading: true });
        loadFromServer().finally(() => {
          useCartStore.setState({ isLoading: false });
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('cart_owner_user_id', currentUserId);
          }
        });
        
        hasMergedRef.current = true; // Prevent double loading
        prevUserIdRef.current = currentUserId;
        console.log('═══════════════════════════════════════════════');
        return;
      }
      
      // Cart belongs to current user or no owner - safe to merge guest cart
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
            
            // CRITICAL FIX: Only use server items - DON'T merge local items
            // Local items may belong to different user if cartOwnerId wasn't set properly
            console.log('✅ CART SYNC: Using ONLY server items (no local merge for safety)');
            
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
      console.log('[cart-event] logout_preserved_cart', { itemCount: useCartStore.getState().items.length, source: 'logout' });
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
      
      // Preserve cart in UI/local storage for guest continuity unless user explicitly clears cart.
      console.log('🚪 Preserving cart in UI/localStorage after logout');

      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cart_owner_user_id');
      }
      
      hasMergedRef.current = false;
      console.log('✅ Cart preserved after logout');
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('🔍 Updated prevUserIdRef to:', currentUserId);
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
