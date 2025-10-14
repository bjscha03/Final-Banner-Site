/**
 * Hook to sync cart when user logs in/out
 */

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';

export function useCartSync() {
  const { user } = useAuth();
  const { loadFromServer } = useCartStore();

  useEffect(() => {
    if (user) {
      console.log('👤 User logged in, syncing cart from Neon...');
      loadFromServer();
    }
  }, [user, loadFromServer]);
}
