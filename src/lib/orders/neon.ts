import { db } from '../supabase/client';
import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

if (!db) {
  console.warn('Neon database configuration missing - this adapter should not be used');
  throw new Error('Neon database configuration missing');
}

export const neonOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    try {
      // Insert order
      const orderResult = await db`
        INSERT INTO orders (user_id, email, subtotal_cents, tax_cents, total_cents, status)
        VALUES (${orderData.user_id}, ${orderData.email}, ${orderData.subtotal_cents}, ${orderData.tax_cents}, ${orderData.total_cents}, 'paid')
        RETURNING *
      `;

      if (!orderResult || orderResult.length === 0) {
        throw new Error('Failed to create order');
      }

      const order = orderResult[0];

      // Insert order items
      for (const item of orderData.items) {
        await db`
          INSERT INTO order_items (order_id, width_in, height_in, quantity, material, grommets, rope_feet, pole_pockets, line_total_cents)
          VALUES (${order.id}, ${item.width_in}, ${item.height_in}, ${item.quantity}, ${item.material}, ${item.grommets}, ${item.rope_feet}, ${item.pole_pockets}, ${item.line_total_cents})
        `;
      }

      return {
        id: order.id,
        user_id: order.user_id,
        email: order.email,
        subtotal_cents: order.subtotal_cents,
        tax_cents: order.tax_cents,
        total_cents: order.total_cents,
        status: order.status,
        tracking_number: order.tracking_number,
        created_at: order.created_at,
        items: orderData.items
      };
    } catch (error) {
      console.error('Error creating order:', error);
      throw new Error('Failed to create order');
    }
  },

  getByUserId: async (userId: string): Promise<Order[]> => {
    try {
      const orders = await db`
        SELECT o.*, 
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', oi.grommets,
                   'rope_feet', oi.rope_feet,
                   'pole_pockets', oi.pole_pockets,
                   'line_total_cents', oi.line_total_cents
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ${userId}
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `;

      return orders.map(order => ({
        ...order,
        items: order.items || []
      }));
    } catch (error) {
      console.error('Error fetching user orders:', error);
      return [];
    }
  },

  getByEmail: async (email: string): Promise<Order[]> => {
    try {
      const orders = await db`
        SELECT o.*, 
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', oi.grommets,
                   'rope_feet', oi.rope_feet,
                   'pole_pockets', oi.pole_pockets,
                   'line_total_cents', oi.line_total_cents
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.email = ${email}
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `;

      return orders.map(order => ({
        ...order,
        items: order.items || []
      }));
    } catch (error) {
      console.error('Error fetching email orders:', error);
      return [];
    }
  },

  getAll: async (): Promise<Order[]> => {
    try {
      const orders = await db`
        SELECT o.*, 
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', oi.grommets,
                   'rope_feet', oi.rope_feet,
                   'pole_pockets', oi.pole_pockets,
                   'line_total_cents', oi.line_total_cents
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `;

      return orders.map(order => ({
        ...order,
        items: order.items || []
      }));
    } catch (error) {
      console.error('Error fetching all orders:', error);
      return [];
    }
  },

  updateTracking: async (orderId: string, trackingNumber: string, carrier: TrackingCarrier): Promise<void> => {
    try {
      await db`
        UPDATE orders 
        SET tracking_number = ${trackingNumber}
        WHERE id = ${orderId}
      `;
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw new Error('Failed to update tracking number');
    }
  }
};
