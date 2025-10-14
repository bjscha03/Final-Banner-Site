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
    
    console.log('🔍 CART SYNC HOOK: User effect triggered');
    console.log('🔍 Previous user ID:', prevUserId);
    console.log('🔍 Current user ID:', currentUserId);
    
    // User changed (different user logged in)
    if (prevUserId && currentUserId && prevUserId !== currentUserId) {
      console.log('⚠️  USER CHANGED: Clearing cart for new user');
      console.log('⚠️  Old user:', prevUserId);
      console.log('⚠️  New user:', currentUserId);
      clearCart(); // Clear the old user's cart
      localStorage.setItem('cart_owner_user_id', currentUserId);
    }
    
    // User logged in (from logged out state)
    if (!prevUserId && currentUserId) {
      console.log('👤 User logged in, syncing cart from Neon...');
      console.log('👤 User ID:', currentUserId);
      localStorage.setItem('cart_owner_user_id', currentUserId);
      loadFromServer();
    }
    
    // User logged out
    if (prevUserId && !currentUserId) {
      console.log('🚪 User logged out, clearing cart ownership');
      localStorage.removeItem('cart_owner_user_id');
      clearCart(); // Clear cart on logout
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
  }, [user, loadFromServer, clearCart]);
}
