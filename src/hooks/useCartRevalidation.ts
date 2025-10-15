/**
 * Cart Revalidation Hook
 * 
 * Provides cross-device cart synchronization by revalidating cart state:
 * - On browser tab focus
 * - On network reconnect
 * - Periodically (optional)
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';

interface UseCartRevalidationOptions {
  /**
   * Enable revalidation on tab focus
   * @default true
   */
  onFocus?: boolean;
  
  /**
   * Enable revalidation on network reconnect
   * @default true
   */
  onReconnect?: boolean;
  
  /**
   * Enable periodic polling (in milliseconds)
   * Set to 0 to disable
   * @default 0 (disabled)
   */
  pollingInterval?: number;
  
  /**
   * Debounce delay for revalidation (in milliseconds)
   * @default 1000
   */
  debounceMs?: number;
}

export function useCartRevalidation(options: UseCartRevalidationOptions = {}) {
  const {
    onFocus = true,
    onReconnect = true,
    pollingInterval = 0,
    debounceMs = 1000,
  } = options;

  const { user } = useAuth();
  const { loadFromServer } = useCartStore();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRevalidationRef = useRef<number>(0);

  /**
   * Revalidate cart with debouncing
   */
  const revalidateCart = () => {
    // Only revalidate if user is logged in
    if (!user) {
      console.log('🔄 REVALIDATION: Skipping - no user logged in');
      return;
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastRevalidation = now - lastRevalidationRef.current;

      // Don't revalidate if we just did it recently
      if (timeSinceLastRevalidation < debounceMs) {
        console.log('🔄 REVALIDATION: Skipping - too soon since last revalidation');
        return;
      }

      console.log('🔄 REVALIDATION: Loading cart from server...');
      lastRevalidationRef.current = now;
      loadFromServer();
    }, debounceMs);
  };

  // Tab focus revalidation
  useEffect(() => {
    if (!onFocus) return;

    const handleFocus = () => {
      console.log('👁️ REVALIDATION: Tab focused');
      revalidateCart();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [onFocus, user]);

  // Network reconnect revalidation
  useEffect(() => {
    if (!onReconnect) return;

    const handleOnline = () => {
      console.log('🌐 REVALIDATION: Network reconnected');
      revalidateCart();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [onReconnect, user]);

  // Periodic polling (optional)
  useEffect(() => {
    if (!pollingInterval || pollingInterval <= 0) return;

    console.log(`⏱️ REVALIDATION: Starting periodic polling every ${pollingInterval}ms`);
    
    const interval = setInterval(() => {
      console.log('⏱️ REVALIDATION: Periodic poll');
      revalidateCart();
    }, pollingInterval);

    return () => {
      console.log('⏱️ REVALIDATION: Stopping periodic polling');
      clearInterval(interval);
    };
  }, [pollingInterval, user]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
}
