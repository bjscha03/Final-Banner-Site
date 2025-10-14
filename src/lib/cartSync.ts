/**
 * Simple Cart Sync for Logged-In Users
 * 
 * This provides cross-device cart synchronization for authenticated users only.
 * Anonymous users continue to use localStorage.
 */

import { createClient } from '@supabase/supabase-js';
import { CartItem } from '@/store/cart';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const cartSync = {
  /**
   * Check if cart sync is available
   */
  isAvailable(): boolean {
    return supabase !== null;
  },

  /**
   * Get current authenticated user ID
   */
  async getUserId(): Promise<string | null> {
    if (!supabase) return null;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  },

  /**
   * Load cart from Supabase for logged-in user
   */
  async loadCart(userId: string): Promise<CartItem[]> {
    if (!supabase) {
      console.warn('Supabase not configured');
      return [];
    }

    try {
      console.log('🔄 Loading cart from Supabase for user:', userId);
      
      const { data, error } = await supabase
        .from('user_carts')
        .select('cart_data')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No cart found - this is normal for new users
          console.log('📭 No cart found in database (new user)');
          return [];
        }
        console.error('Error loading cart:', error);
        return [];
      }

      const items = data?.cart_data || [];
      console.log('✅ Loaded cart from Supabase:', items.length, 'items');
      return items;
    } catch (error) {
      console.error('Failed to load cart:', error);
      return [];
    }
  },

  /**
   * Save cart to Supabase for logged-in user
   */
  async saveCart(userId: string, items: CartItem[]): Promise<boolean> {
    if (!supabase) {
      console.warn('Supabase not configured');
      return false;
    }

    try {
      console.log('💾 Saving cart to Supabase for user:', userId, '-', items.length, 'items');
      
      const { error } = await supabase
        .from('user_carts')
        .upsert({
          user_id: userId,
          cart_data: items,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving cart:', error);
        return false;
      }

      console.log('✅ Cart saved to Supabase');
      return true;
    } catch (error) {
      console.error('Failed to save cart:', error);
      return false;
    }
  },

  /**
   * Merge local cart with server cart when user logs in
   */
  async mergeAndSyncCart(userId: string, localItems: CartItem[]): Promise<CartItem[]> {
    if (!supabase) {
      return localItems;
    }

    try {
      console.log('🔄 Merging local cart with server cart...');
      console.log('📱 Local cart:', localItems.length, 'items');
      
      // Load server cart
      const serverItems = await this.loadCart(userId);
      console.log('☁️  Server cart:', serverItems.length, 'items');

      // Merge strategy: Keep all items from both, but deduplicate by ID
      const itemMap = new Map<string, CartItem>();
      
      // Add server items first (they're the source of truth for this user)
      serverItems.forEach(item => {
        itemMap.set(item.id, item);
      });
      
      // Add local items (will override server items with same ID)
      localItems.forEach(item => {
        itemMap.set(item.id, item);
      });

      const mergedItems = Array.from(itemMap.values());
      console.log('✅ Merged cart:', mergedItems.length, 'items');

      // Save merged cart to server
      await this.saveCart(userId, mergedItems);

      return mergedItems;
    } catch (error) {
      console.error('Failed to merge carts:', error);
      return localItems; // Fallback to local cart
    }
  },

  /**
   * Clear cart from Supabase
   */
  async clearCart(userId: string): Promise<boolean> {
    if (!supabase) {
      return false;
    }

    try {
      console.log('🗑️  Clearing cart from Supabase for user:', userId);
      
      const { error } = await supabase
        .from('user_carts')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('Error clearing cart:', error);
        return false;
      }

      console.log('✅ Cart cleared from Supabase');
      return true;
    } catch (error) {
      console.error('Failed to clear cart:', error);
      return false;
    }
  },
};
