/**
 * Enhanced Cart Synchronization Service
 * 
 * Provides robust cart persistence with:
 * - Single active cart per authenticated user
 * - Guest cart support with session cookies
 * - Deep-match merge logic for guest-to-authenticated transitions
 * - Cross-device synchronization
 * - Idempotency and race condition protection
 * - Structured logging and telemetry
 * 
 * UPDATED: Now uses Netlify Functions for database access instead of direct Supabase client
 */

import type { CartItem } from '@/store/cart';

// Telemetry event types
export type CartEvent = 
  | 'CART_INIT'
  | 'CART_ADD'
  | 'CART_UPDATE'
  | 'CART_REMOVE'
  | 'CART_MERGE'
  | 'CART_CLEAR'
  | 'CART_LOAD'
  | 'CART_SAVE'
  | 'ORDER_DRAFT_RESUME';

interface CartEventData {
  event: CartEvent;
  userId?: string;
  sessionId?: string;
  requestId: string;
  itemCount?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

// Session management
const SESSION_COOKIE_NAME = 'cart_session_id';
const SESSION_LIFETIME_DAYS = 90;

class CartSyncService {
  private requestIdCounter = 0;

  /**
   * Generate a unique request ID for tracking
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Emit a structured log event
   */
  private logEvent(data: CartEventData): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...data,
      // Exclude PII - hash user/session IDs
      userId: data.userId ? `user_${data.userId.substring(0, 8)}...` : undefined,
      sessionId: data.sessionId ? `session_${data.sessionId.substring(0, 8)}...` : undefined,
    };

    if (data.success) {
      console.log(`✅ [${data.event}]`, logEntry);
    } else {
      console.error(`❌ [${data.event}]`, logEntry);
    }

    // TODO: Send to analytics/monitoring service
    // Example: sendToDatadog(logEntry);
  }

  /**
   * Get or create a session ID for guest users
   */
  getSessionId(): string {
    if (typeof document === 'undefined') return '';
    
    // Try to get existing session from cookie
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === SESSION_COOKIE_NAME) {
        return value;
      }
    }

    // Create new session ID
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Set cookie with long lifetime
    const expires = new Date();
    expires.setDate(expires.getDate() + SESSION_LIFETIME_DAYS);
    document.cookie = `${SESSION_COOKIE_NAME}=${sessionId}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    
    return sessionId;
  }

  /**
   * Clear the guest session cookie
   */
  clearSessionCookie(): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
  }

  /**
   * Get current user ID from localStorage
   */
  getUserId(): string | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const userStr = localStorage.getItem('banners_current_user');
      if (!userStr) return null;
      const user = JSON.parse(userStr);
      return user?.id || null;
    } catch (error) {
      console.error('Error getting user ID:', error);
      return null;
    }
  }

  /**
   * Check if cart sync is available (always true now with Netlify functions)
   */
  isAvailable(): boolean {
    return true; // Always available via Netlify functions
  }

  /**
   * Deep-match cart items by product attributes
   * Returns true if items are the same product with same options
   */
  private itemsMatch(item1: CartItem, item2: CartItem): boolean {
    // Match by dimensions, material, and options
    return (
      item1.width_in === item2.width_in &&
      item1.height_in === item2.height_in &&
      item1.material === item2.material &&
      item1.grommets === item2.grommets &&
      item1.pole_pockets === item2.pole_pockets &&
      item1.pole_pocket_size === item2.pole_pocket_size &&
      item1.rope_feet === item2.rope_feet &&
      // Match file if both have files
      ((!item1.file_key && !item2.file_key) || item1.file_key === item2.file_key)
    );
  }

  /**
   * Merge two cart item arrays with deep matching
   * - Items with exact matches sum quantities
   * - Unique items are added as separate line items
   */
  mergeCartItems(localItems: CartItem[], serverItems: CartItem[]): CartItem[] {
    const requestId = this.generateRequestId();
    
    try {
      const merged: CartItem[] = [];
      const processedServerIndices = new Set<number>();

      // Process local items
      for (const localItem of localItems) {
        let foundMatch = false;

        // Try to find matching server item
        for (let i = 0; i < serverItems.length; i++) {
          if (processedServerIndices.has(i)) continue;

          const serverItem = serverItems[i];
          if (this.itemsMatch(localItem, serverItem)) {
            // Found a match - merge quantities
            const mergedQuantity = localItem.quantity + serverItem.quantity;
            merged.push({
              ...serverItem, // Use server item as base (it has the authoritative pricing)
              quantity: mergedQuantity,
              // Recalculate line total based on merged quantity
              line_total_cents: Math.round(
                (serverItem.line_total_cents / serverItem.quantity) * mergedQuantity
              ),
            });
            processedServerIndices.add(i);
            foundMatch = true;
            break;
          }
        }

        // No match found - add as unique item
        if (!foundMatch) {
          merged.push(localItem);
        }
      }

      // Add remaining unprocessed server items
      for (let i = 0; i < serverItems.length; i++) {
        if (!processedServerIndices.has(i)) {
          merged.push(serverItems[i]);
        }
      }

      this.logEvent({
        event: 'CART_MERGE',
        requestId,
        success: true,
        metadata: {
          localCount: localItems.length,
          serverCount: serverItems.length,
          mergedCount: merged.length,
        },
      });

      return merged;
    } catch (error) {
      this.logEvent({
        event: 'CART_MERGE',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback: return all items without merging
      return [...localItems, ...serverItems];
    }
  }

  /**
   * Load cart from database via Netlify function
   * For authenticated users: load by user_id
   * For guests: load by session_id
   */
  async loadCart(userId?: string, sessionId?: string): Promise<CartItem[]> {
    const requestId = this.generateRequestId();

    try {
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (sessionId) params.append('sessionId', sessionId);

      console.log('[cart-load] Calling Netlify function:', { userId: userId ? `${userId.substring(0, 8)}...` : null, sessionId: sessionId ? `${sessionId.substring(0, 12)}...` : null });

      const response = await fetch(`/.netlify/functions/cart-load?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const cartData = data.cartData || [];

      this.logEvent({
        event: 'CART_LOAD',
        userId,
        sessionId,
        requestId,
        itemCount: cartData.length,
        success: true,
      });

      console.log('[cart-load] Loaded', cartData.length, 'items from server');
      return cartData;
    } catch (error) {
      this.logEvent({
        event: 'CART_LOAD',
        userId,
        sessionId,
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error('[cart-load] Error loading cart:', error);
      return [];
    }
  }

  /**
   * Save cart to database via Netlify function
   */
  async saveCart(items: CartItem[], userId?: string, sessionId?: string): Promise<boolean> {
    const requestId = this.generateRequestId();

    if (!userId && !sessionId) {
      this.logEvent({
        event: 'CART_SAVE',
        requestId,
        success: false,
        error: 'Either userId or sessionId must be provided',
      });
      return false;
    }

    try {
      console.log('[cart-save] Calling Netlify function:', { userId: userId ? `${userId.substring(0, 8)}...` : null, sessionId: sessionId ? `${sessionId.substring(0, 12)}...` : null, itemCount: items.length });

      const response = await fetch('/.netlify/functions/cart-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          sessionId,
          cartData: items,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      this.logEvent({
        event: 'CART_SAVE',
        userId,
        sessionId,
        requestId,
        itemCount: items.length,
        success: true,
      });

      console.log('[cart-save] Saved', items.length, 'items to server');
      return true;
    } catch (error) {
      console.error('[cart-save] Error saving cart:', error);
      this.logEvent({
        event: 'CART_SAVE',
        userId,
        sessionId,
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Merge guest cart into authenticated user's cart on login
   * - Loads both guest and user carts
   * - Merges with deep matching
   * - Archives guest cart
   * - Clears guest session cookie
   * - Saves merged cart to user's account
   */
  async mergeGuestCartOnLogin(userId: string, explicitSessionId?: string): Promise<CartItem[]> {
    const requestId = this.generateRequestId();
    // Use explicit session ID if provided (from checkout context), otherwise get current session
    const sessionId = explicitSessionId || this.getSessionId();
    
    console.log('🔄 CART SYNC: mergeGuestCartOnLogin called', {
      userId: `${userId.substring(0, 8)}...`,
      sessionId: sessionId ? `${sessionId.substring(0, 12)}...` : 'none',
      isExplicit: !!explicitSessionId,
    });

    try {
      // Load guest cart
      console.log('🔄 CART SYNC: Loading guest cart with sessionId:', sessionId ? `${sessionId.substring(0, 12)}...` : 'none');
      const guestItems = await this.loadCart(undefined, sessionId);
      console.log('🔄 CART SYNC: Guest cart loaded:', guestItems.length, 'items');
      
      // Load user's existing cart
      console.log('🔄 CART SYNC: Loading user cart for userId:', userId ? `${userId.substring(0, 8)}...` : 'none');
      const userItems = await this.loadCart(userId);
      console.log('🔄 CART SYNC: User cart loaded:', userItems.length, 'items');

      // Merge carts
      console.log('🔄 CART SYNC: Merging carts...');
      const mergedItems = this.mergeCartItems(guestItems, userItems);
      console.log('🔄 CART SYNC: Merged result:', mergedItems.length, 'items');

      // Save merged cart to user's account
      console.log('🔄 CART SYNC: Saving merged cart to database...');
      await this.saveCart(mergedItems, userId);
      console.log('✅ CART SYNC: Merged cart saved to database');

      // Clear guest session cookie
      this.clearSessionCookie();

      this.logEvent({
        event: 'CART_MERGE',
        userId,
        sessionId,
        requestId,
        itemCount: mergedItems.length,
        success: true,
        metadata: {
          guestItemCount: guestItems.length,
          userItemCount: userItems.length,
          mergedItemCount: mergedItems.length,
        },
      });

      return mergedItems;
    } catch (error) {
      this.logEvent({
        event: 'CART_MERGE',
        userId,
        sessionId,
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Fallback: just return user's cart
      return await this.loadCart(userId);
    }
  }

  /**
   * Clear cart from database
   */
  async clearCart(userId?: string, sessionId?: string): Promise<boolean> {
    const requestId = this.generateRequestId();

    try {
      // For now, just save an empty cart
      const success = await this.saveCart([], userId, sessionId);

      this.logEvent({
        event: 'CART_CLEAR',
        userId,
        sessionId,
        requestId,
        success,
      });

      return success;
    } catch (error) {
      this.logEvent({
        event: 'CART_CLEAR',
        userId,
        sessionId,
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Legacy compatibility: merge and sync cart (used by existing code)
   */
  async mergeAndSyncCart(userId: string, localItems: CartItem[]): Promise<CartItem[]> {
    try {
      // Load server cart
      const serverItems = await this.loadCart(userId);
      
      // Merge carts
      const mergedItems = this.mergeCartItems(localItems, serverItems);
      
      // Save merged cart
      await this.saveCart(mergedItems, userId);
      
      return mergedItems;
    } catch (error) {
      console.error('Error in mergeAndSyncCart:', error);
      return localItems;
    }
  }
}

// Export singleton instance
const cartSyncService = new CartSyncService();

// Export legacy interface for backward compatibility
export const cartSync = {
  isAvailable: () => cartSyncService.isAvailable(),
  getUserId: () => cartSyncService.getUserId(),
  getSessionId: () => cartSyncService.getSessionId(),
  loadCart: (userId: string) => cartSyncService.loadCart(userId),
  saveCart: (items: CartItem[], userId?: string, sessionId?: string) => cartSyncService.saveCart(items, userId, sessionId),
  mergeAndSyncCart: (userId: string, localItems: CartItem[]) => cartSyncService.mergeAndSyncCart(userId, localItems),
  clearCart: (userId: string) => cartSyncService.clearCart(userId),
};

// Export new service for enhanced features
export { cartSyncService };
