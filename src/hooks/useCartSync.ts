/**
 * Hook to sync cart when user logs in/out
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';

export function useCartSync() {
  const { user } = useAuth();
  const { loadFromServer, clearCart } = useCartStore();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = user?.id || null;
    const prevUserId = prevUserIdRef.current;
    
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 CART SYNC HOOK: User effect triggered');
    console.log('🔍 Previous user ID:', prevUserId);
    console.log('🔍 Current user ID:', currentUserId);
    console.log('🔍 User object:', user);
    console.log('🔍 User email:', user?.email);
    
    // SAFETY: Clear cart IMMEDIATELY if user changed (before any async operations)
    // This prevents User B from seeing User A's cart even if database fails
    if (prevUserId && currentUserId && prevUserId !== currentUserId) {
      console.log('🚨 SAFETY CLEAR: User changed detected, clearing cart IMMEDIATELY');
      console.log('🚨 Previous user:', prevUserId);
      console.log('🚨 New user:', currentUserId);
      clearCart(); // Clear synchronously, right now
      localStorage.setItem('cart_owner_user_id', currentUserId);
    }
    
    // SAFETY: Clear cart IMMEDIATELY if user changed (before any async operations)
    // This prevents User B from seeing User A's cart even if database fails
    if (prevUserId && currentUserId && prevUserId !== currentUserId) {
      console.log('🚨 SAFETY CLEAR: User changed detected, clearing cart IMMEDIATELY');
      console.log('🚨 Previous user:', prevUserId);
      console.log('🚨 New user:', currentUserId);
      clearCart(); // Clear synchronously, right now
      localStorage.setItem('cart_owner_user_id', currentUserId);
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
      localStorage.setItem('cart_owner_user_id', currentUserId);
      
      // Load the new user's cart from Neon
      console.log('👤 Loading new user cart from Neon...');
      loadFromServer();
    }
    
    // User logged in (from logged out state)
    if (!prevUserId && currentUserId) {
      console.log('👤 User logged in, syncing cart from Neon...');
      console.log('👤 User ID:', currentUserId);
      console.log('👤 User email:', user?.email);
      console.log('👤 Setting cart owner in localStorage...');
      localStorage.setItem('cart_owner_user_id', currentUserId);
      console.log('👤 About to call loadFromServer()...');
      loadFromServer();
      console.log('�� loadFromServer() called');
    }
    
    // User logged out
    if (prevUserId && !currentUserId) {
      console.log('🚪 User logged out');
      console.log('🚪 Cart will remain in localStorage for next login');
      console.log('🚪 Removing cart ownership tracking');
      localStorage.removeItem('cart_owner_user_id');
      // DO NOT clear cart - it should persist in localStorage
      // When user logs back in, it will merge with server cart
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
