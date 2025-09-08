import { createClient } from '@supabase/supabase-js';
import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase configuration missing - this adapter should not be used');
  throw new Error('Supabase configuration missing');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        user_id: orderData.user_id,
        status: 'paid',
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: orderData.total_cents,
        currency: orderData.currency,
        items: orderData.items,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating order:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }

    return data as Order;
  },

  listByUser: async (userId: string, page = 1): Promise<Order[]> => {
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(start, end);

    if (error) {
      console.error('Error fetching user orders:', error);
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }

    return data as Order[];
  },

  listAll: async (page = 1): Promise<Order[]> => {
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(start, end);

    if (error) {
      console.error('Error fetching all orders:', error);
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }

    return data as Order[];
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    const { error } = await supabase
      .from('orders')
      .update({
        tracking_carrier: carrier,
        tracking_number: number,
        status: 'shipped', // Update status to shipped when tracking is added
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating tracking:', error);
      throw new Error(`Failed to update tracking: ${error.message}`);
    }
  },

  get: async (id: string): Promise<Order | null> => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      console.error('Error fetching order:', error);
      throw new Error(`Failed to fetch order: ${error.message}`);
    }

    return data as Order;
  },
};
