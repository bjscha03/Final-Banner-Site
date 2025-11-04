/**
 * Checkout Context Store
 * 
 * Stores checkout state for authentication flows.
 * Uses persist middleware to maintain state across page navigations during auth flow.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CheckoutContextState {
  // Whether user is currently in checkout flow
  isInCheckoutFlow: boolean;
  
  // URL to return to after authentication (typically '/checkout')
  returnUrl: string | null;
  
  // Guest session ID to preserve for cart merging
  guestSessionId: string | null;
  
  // Timestamp when checkout context was set (for expiration)
  contextSetAt: number | null;
  
  // Actions
  setCheckoutContext: (returnUrl: string, guestSessionId?: string) => void;
  clearCheckoutContext: () => void;
  getReturnUrl: () => string;
  isContextValid: () => boolean;
}

// Context expires after 30 minutes
const CONTEXT_EXPIRATION_MS = 30 * 60 * 1000;

export const useCheckoutContext = create<CheckoutContextState>()(
  persist(
    (set, get) => ({
      isInCheckoutFlow: false,
      returnUrl: null,
      guestSessionId: null,
      contextSetAt: null,

      /**
       * Set checkout context before redirecting to auth
       * @param returnUrl - URL to return to after auth (e.g., '/checkout')
       * @param guestSessionId - Optional guest session ID for cart merging
       */
      setCheckoutContext: (returnUrl: string, guestSessionId?: string) => {
        console.log('🛒 CHECKOUT CONTEXT: Setting context', {
          returnUrl,
          guestSessionId: guestSessionId ? `${guestSessionId.substring(0, 12)}...` : 'none',
        });

        set({
          isInCheckoutFlow: true,
          returnUrl,
          guestSessionId: guestSessionId || null,
          contextSetAt: Date.now(),
        });
      },

      /**
       * Clear checkout context after successful redirect or expiration
       */
      clearCheckoutContext: () => {
        console.log('🛒 CHECKOUT CONTEXT: Clearing context');
        
        set({
          isInCheckoutFlow: false,
          returnUrl: null,
          guestSessionId: null,
          contextSetAt: null,
        });
      },

      /**
       * Get the return URL, defaulting to '/checkout' if not set
       */
      getReturnUrl: () => {
        const state = get();
        return state.returnUrl || '/checkout';
      },

      /**
       * Check if the checkout context is still valid (not expired)
       */
      isContextValid: () => {
        const state = get();
        
        if (!state.isInCheckoutFlow || !state.contextSetAt) {
          return false;
        }

        const age = Date.now() - state.contextSetAt;
        const isValid = age < CONTEXT_EXPIRATION_MS;

        if (!isValid) {
          console.log('⏰ CHECKOUT CONTEXT: Context expired', {
            ageMinutes: Math.round(age / 60000),
            maxMinutes: CONTEXT_EXPIRATION_MS / 60000,
          });
        }

        return isValid;
      },
    }),
    {
      name: 'checkout-context-storage',
    }
  )
);
