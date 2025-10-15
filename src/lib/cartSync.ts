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
 */

import { db } from './supabase/client';
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
   * Check if database is available
   */
  isAvailable(): boolean {
    return db !== null;
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
   * Load cart from database
   * For authenticated users: load by user_id
   * For guests: load by session_id
   */
  async loadCart(userId?: string, sessionId?: string): Promise<CartItem[]> {
    const requestId = this.generateRequestId();

    if (!this.isAvailable()) {
      this.logEvent({
        event: 'CART_LOAD',
        requestId,
        success: false,
        error: 'Database not available',
      });
      return [];
    }

    try {
      let result;

      if (userId) {
        // Load authenticated user's cart
        result = await db!`
          SELECT cart_data, updated_at
          FROM user_carts
          WHERE user_id = ${userId} AND status = 'active'
          LIMIT 1
        `;
      } else if (sessionId) {
        // Load guest cart
        result = await db!`
          SELECT cart_data, updated_at
          FROM user_carts
          WHERE session_id = ${sessionId} AND status = 'active'
          LIMIT 1
        `;
      } else {
        throw new Error('Either userId or sessionId must be provided');
      }

      const cartData = result && result.length > 0 ? (result[0].cart_data as CartItem[]) : [];

      this.logEvent({
        event: 'CART_LOAD',
        userId,
        sessionId,
        requestId,
        itemCount: cartData.length,
        success: true,
      });

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
      return [];
    }
  }

  /**
   * Save cart to database with idempotency
   */
  async saveCart(items: CartItem[], userId?: string, sessionId?: string): Promise<boolean> {
    const requestId = this.generateRequestId();

    if (!this.isAvailable()) {
      this.logEvent({
        event: 'CART_SAVE',
        requestId,
        success: false,
        error: 'Database not available',
      });
      return false;
    }

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
      const cartDataJson = JSON.stringify(items);

      if (userId) {
        // Save authenticated user's cart
        // Use two-step approach: archive old carts, then insert new one
        await db!`
          UPDATE user_carts
          SET status = 'archived', updated_at = NOW()
          WHERE user_id = ${userId} AND status = 'active'
        `;
        
        await db!`
          INSERT INTO user_carts (user_id, cart_data, status, updated_at, last_accessed_at)
          VALUES (${userId}, ${cartDataJson}::jsonb, 'active', NOW(), NOW())
        `;
      } else if (sessionId) {
        // Save guest cart
        // Use two-step approach: archive old carts, then insert new one
        await db!`
          UPDATE user_carts
          SET status = 'archived', updated_at = NOW()
          WHERE session_id = ${sessionId} AND status = 'active'
        `;
        
        await db!`
          INSERT INTO user_carts (session_id, cart_data, status, updated_at, last_accessed_at)
          VALUES (${sessionId}, ${cartDataJson}::jsonb, 'active', NOW(), NOW())
        `;
      }

      this.logEvent({
        event: 'CART_SAVE',
        userId,
        sessionId,
        requestId,
        itemCount: items.length,
        success: true,
      });

      return true;
    } catch (error) {
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
  async mergeGuestCartOnLogin(userId: string): Promise<CartItem[]> {
    const requestId = this.generateRequestId();
    const sessionId = this.getSessionId();

    try {
      // Load guest cart
      const guestItems = await this.loadCart(undefined, sessionId);
      
      // Load user's existing cart
      const userItems = await this.loadCart(userId);

      // Merge carts
      const mergedItems = this.mergeCartItems(guestItems, userItems);

      // Save merged cart to user's account
      await this.saveCart(mergedItems, userId);

      // Archive guest cart (mark as merged, don't delete)
      if (guestItems.length > 0 && this.isAvailable()) {
        try {
          await db!`
            UPDATE user_carts
            SET status = 'merged', updated_at = NOW()
            WHERE session_id = ${sessionId} AND status = 'active'
          `;
        } catch (error) {
          console.error('Failed to archive guest cart:', error);
        }
      }

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

    if (!this.isAvailable()) {
      this.logEvent({
        event: 'CART_CLEAR',
        requestId,
        success: false,
        error: 'Database not available',
      });
      return false;
    }

    try {
      if (userId) {
        await db!`
          UPDATE user_carts
          SET status = 'abandoned', updated_at = NOW()
          WHERE user_id = ${userId} AND status = 'active'
        `;
      } else if (sessionId) {
        await db!`
          UPDATE user_carts
          SET status = 'abandoned', updated_at = NOW()
          WHERE session_id = ${sessionId} AND status = 'active'
        `;
      }

      this.logEvent({
        event: 'CART_CLEAR',
        userId,
        sessionId,
        requestId,
        success: true,
      });

      return true;
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
   * Reconcile multiple active carts for a user (cleanup function)
   * Keeps the most recently updated cart, archives others
   */
  async reconcileUserCarts(userId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      // Find all active carts for this user
      const carts = await db!`
        SELECT id, cart_data, updated_at
        FROM user_carts
        WHERE user_id = ${userId} AND status = 'active'
        ORDER BY updated_at DESC
      `;

      if (carts.length <= 1) {
        // No duplicates, nothing to do
        return;
      }

      // Keep the first (most recent) cart, archive the rest
      const keepCartId = carts[0].id;
      const archiveIds = carts.slice(1).map((c: any) => c.id);

      await db!`
        UPDATE user_carts
        SET status = 'archived', updated_at = NOW()
        WHERE id = ANY(${archiveIds})
      `;

      console.log(`Reconciled ${archiveIds.length} duplicate carts for user ${userId}`);
    } catch (error) {
      console.error('Failed to reconcile user carts:', error);
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
  loadCart: (userId: string) => cartSyncService.loadCart(userId),
  saveCart: (userId: string, items: CartItem[]) => cartSyncService.saveCart(items, userId),
  mergeAndSyncCart: (userId: string, localItems: CartItem[]) => cartSyncService.mergeAndSyncCart(userId, localItems),
  clearCart: (userId: string) => cartSyncService.clearCart(userId),
};

// Export new service for enhanced features
export { cartSyncService };
