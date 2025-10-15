/**
 * Cart Sync for Logged-In Users using Neon PostgreSQL
 * 
 * This provides cross-device cart synchronization for authenticated users.
 * Anonymous users continue to use localStorage only.
 */

import { db } from './supabase/client';
import type { CartItem } from '@/store/cart';

export const cartSync = {
  /**
   * Check if cart sync is available (database configured)
   */
  isAvailable(): boolean {
    return db !== null;
  },

  /**
   * Get current user ID from localStorage auth
   */
  getUserId(): string | null {
    try {
      const userStr = localStorage.getItem('banners_current_user');
      console.log('🔍 CART SYNC: Getting user ID from localStorage');
      console.log('🔍 CART SYNC: Raw user string:', userStr ? userStr.substring(0, 100) + '...' : 'null');
      
      if (!userStr) {
        console.log('❌ CART SYNC: No user found in localStorage');
        return null;
      }
      
      const user = JSON.parse(userStr);
      console.log('🔍 CART SYNC: Parsed user:', { id: user?.id, email: user?.email });
      
      const userId = user?.id || null;
      console.log('✅ CART SYNC: Returning user ID:', userId);
      return userId;
    } catch (error) {
      console.error('❌ CART SYNC: Error getting user ID:', error);
      return null;
    }
  },

  /**
   * Load cart from Neon database for a user
   */
  async loadCart(userId: string): Promise<CartItem[]> {
    console.log('🔄 LOAD START: loadCart called');
    console.log('🔄 LOAD: User ID:', userId);
    
    if (!this.isAvailable()) {
      console.log('❌ LOAD: Database not available, skipping cart load');
      console.log('❌ LOAD: db value:', db);
      return [];
    }

    console.log('✅ LOAD: Database is available');

    try {
      console.log(`🔄 Loading cart from Neon for user: ${userId}...`);
      console.log('🔄 LOAD: About to execute SQL SELECT...');
      
      const result = await db!`
        SELECT cart_data 
        FROM user_carts 
        WHERE user_id = ${userId}
      `;

      console.log('🔄 LOAD: SQL executed, result:', result);
      console.log('🔄 LOAD: Result length:', result?.length);
      console.log('🔄 LOAD: Result data:', result);

      if (result && result.length > 0) {
        const cartData = result[0].cart_data as CartItem[];
        console.log(`✅ LOAD: Found cart data, ${cartData.length} items`);
        console.log('✅ LOAD: Cart items:', cartData.map(i => ({ id: i.id, name: i.banner_name })));
        console.log(`✅ Loaded cart from Neon: ${cartData.length} items`);
        return cartData;
      }

      console.log('📭 LOAD: No cart found in Neon for this user');
      console.log('📭 LOAD: This is normal for first-time users');
      return [];
    } catch (error) {
      console.error('❌ CART SYNC ERROR: Failed to load cart from Neon');
      console.error('❌ CART SYNC ERROR: User ID:', userId);
      console.error('❌ CART SYNC ERROR: Error details:', error);
      console.error('❌ CART SYNC ERROR: This likely means the user_carts table does not exist in Neon database');
      console.error('❌ CART SYNC ERROR: Run the SQL migration from database-migrations/add-user-carts.sql');
      return [];
    }
  },

  /**
   * Save cart to Neon database for a user
   */
  async saveCart(userId: string, items: CartItem[]): Promise<boolean> {
    console.log('💾 SAVE START: saveCart called');
    console.log('💾 SAVE: User ID:', userId);
    console.log('💾 SAVE: Items count:', items.length);
    console.log('💾 SAVE: Items:', items.map(i => ({ id: i.id, name: i.banner_name })));
    
    if (!this.isAvailable()) {
      console.log('❌ SAVE: Database not available, skipping cart save');
      console.log('❌ SAVE: db value:', db);
      return false;
    }

    console.log('✅ SAVE: Database is available, proceeding with save');

    try {
      console.log(`💾 Saving cart to Neon for user: ${userId} - ${items.length} items`);
      console.log('💾 SAVE: About to execute SQL INSERT...');
      
      // Use INSERT ... ON CONFLICT to upsert
      await db!`
        INSERT INTO user_carts (user_id, cart_data, updated_at)
        VALUES (${userId}, ${JSON.stringify(items)}::jsonb, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          cart_data = ${JSON.stringify(items)}::jsonb,
          updated_at = NOW()
      `;

      console.log('✅ SAVE: SQL executed successfully');
      console.log('✅ Cart saved to Neon');
      console.log('✅ SAVE: Verifying save by reading back...');
      
      // Verify the save worked
      const verification = await db!`SELECT cart_data FROM user_carts WHERE user_id = ${userId}`;
      console.log('✅ SAVE: Verification result:', verification);
      console.log('✅ SAVE: Saved items count:', verification[0]?.cart_data?.length || 0);
      
      return true;
    } catch (error) {
      console.error('❌ CART SYNC ERROR: Failed to save cart to Neon');
      console.error('❌ CART SYNC ERROR: User ID:', userId);
      console.error('❌ CART SYNC ERROR: Items count:', items.length);
      console.error('❌ CART SYNC ERROR: Error details:', error);
      console.error('❌ CART SYNC ERROR: This likely means the user_carts table does not exist in Neon database');
      console.error('❌ CART SYNC ERROR: Run the SQL migration from database-migrations/add-user-carts.sql');
      return false;
    }
  },

  /**
   * Merge local cart with server cart and save
   * Used when user logs in
   */
  async mergeAndSyncCart(userId: string, localItems: CartItem[]): Promise<CartItem[]> {
    if (!this.isAvailable()) {
      console.log('💾 Database not available, using local cart only');
      return localItems;
    }

    try {
      console.log('🔄 Merging local cart with server cart...');
      console.log(`📱 Local cart: ${localItems.length} items`);

      // Load server cart
      const serverItems = await this.loadCart(userId);
      console.log(`☁️  Server cart: ${serverItems.length} items`);

      // Merge strategy: Keep all items from both, deduplicate by ID
      const itemMap = new Map<string, CartItem>();
      
      // Add server items first
      serverItems.forEach(item => itemMap.set(item.id, item));
      
      // Add local items (will overwrite server items with same ID)
      localItems.forEach(item => itemMap.set(item.id, item));

      const mergedItems = Array.from(itemMap.values());
      console.log(`✅ Merged cart: ${mergedItems.length} items`);

      // Save merged cart to server
      await this.saveCart(userId, mergedItems);

      return mergedItems;
    } catch (error) {
      console.error('❌ Error merging carts:', error);
      return localItems; // Fallback to local cart
    }
  },

  /**
   * Clear cart from Neon database
   */
  async clearCart(userId: string): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('💾 Database not available, skipping cart clear');
      return false;
    }

    try {
      console.log(`🗑️  Clearing cart from Neon for user: ${userId}`);
      
      await db!`
        DELETE FROM user_carts 
        WHERE user_id = ${userId}
      `;

      console.log('✅ Cart cleared from Neon');
      return true;
    } catch (error) {
      console.error('❌ Error clearing cart from Neon:', error);
      return false;
    }
  },
};
