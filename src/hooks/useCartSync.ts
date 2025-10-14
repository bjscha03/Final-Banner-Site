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
      console.log('👤 User email:', user?.email);
      console.log('👤 Setting cart owner in localStorage...');
      localStorage.setItem('cart_owner_user_id', currentUserId);
      console.log('👤 About to call loadFromServer()...');
      loadFromServer();
      console.log('�� loadFromServer() called');
    }
    
    // User logged out
    if (prevUserId && !currentUserId) {
      console.log('🚪 User logged out, clearing cart ownership');
      localStorage.removeItem('cart_owner_user_id');
      clearCart(); // Clear cart on logout
    }
    
    // Update the ref
    prevUserIdRef.current = currentUserId;
    console.log('═══════════════════════════════════════════════');
  }, [user, loadFromServer, clearCart]);
}
