import { db } from '../supabase/client';
import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

// Don't throw error immediately - let the adapter handle it gracefully

export const neonOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    if (!db) {
      throw new Error('Database not configured - using local adapter instead');
    }

    try {
      console.log('Creating order with data:', orderData);

      // Get user email from profiles table if user_id is provided
      let userEmail = 'guest@example.com';
      if (orderData.user_id) {
        try {
          const userResult = await db`
            SELECT email FROM profiles WHERE id = ${orderData.user_id}
          `;
          if (userResult.length > 0) {
            userEmail = userResult[0].email;
            console.log('Found user email:', userEmail);
          }
        } catch (emailError) {
          console.warn('Could not fetch user email:', emailError);
        }
      }

      // Insert order - match the current database schema with tax breakdown
      const orderResult = await db`
        INSERT INTO orders (user_id, email, subtotal_cents, tax_cents, total_cents, status)
        VALUES (${orderData.user_id}, ${userEmail}, ${orderData.subtotal_cents}, ${orderData.tax_cents}, ${orderData.total_cents}, 'paid')
        RETURNING *
      `;

      if (!orderResult || orderResult.length === 0) {
        throw new Error('Failed to create order');
      }

      const order = orderResult[0];
      console.log('Order created:', order);

      // Insert order items - match the actual database schema
      for (const item of orderData.items) {
        console.log('Inserting order item:', item);
        await db`
          INSERT INTO order_items (order_id, width_in, height_in, quantity, material, grommets, rope_feet, line_total_cents)
          VALUES (${order.id}, ${item.width_in}, ${item.height_in}, ${item.quantity}, ${item.material}, ${item.grommets || 'none'}, ${item.rope_feet || 0}, ${item.line_total_cents})
        `;
      }

      return {
        id: order.id,
        user_id: order.user_id,
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: order.total_cents,
        status: order.status,
        currency: orderData.currency,
        tracking_number: order.tracking_number,
        tracking_carrier: null,
        created_at: order.created_at,
        items: orderData.items
      };
    } catch (error) {
      console.error('Error creating order:', error);
      console.error('Error details:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  },

  listByUser: async (userId: string, page?: number): Promise<Order[]> => {
    if (!db) {
      return [];
    }

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

  listAll: async (page?: number): Promise<Order[]> => {
    if (!db) {
      return [];
    }

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
                   'line_total_cents', oi.line_total_cents
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id
        ORDER BY o.created_at DESC
        ${page ? db`LIMIT 50 OFFSET ${(page - 1) * 50}` : db``}
      `;

      return orders.map(order => ({
        ...order,
        email: order.email,
        items: order.items || []
      }));
    } catch (error) {
      console.error('Error fetching email orders:', error);
      return [];
    }
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    if (!db) {
      throw new Error('Database not configured');
    }

    try {
      await db`
        UPDATE orders
        SET tracking_number = ${number},
            tracking_carrier = ${carrier},
            status = 'shipped'
        WHERE id = ${id}
      `;
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw new Error('Failed to update tracking number');
    }
  },

  get: async (id: string): Promise<Order | null> => {
    if (!db) {
      return null;
    }

    try {
      const orders = await db`
        SELECT o.*,
               json_agg(
                 json_build_object(
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', oi.grommets,
                   'rope_feet', oi.rope_feet,
                   'area_sqft', oi.width_in * oi.height_in / 144.0,
                   'unit_price_cents', oi.line_total_cents / oi.quantity,
                   'line_total_cents', oi.line_total_cents
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.id = ${id}
        GROUP BY o.id
      `;

      if (!orders || orders.length === 0) {
        return null;
      }

      const order = orders[0];
      return {
        id: order.id,
        user_id: order.user_id,
        email: order.email,
        subtotal_cents: order.total_cents, // We don't store subtotal separately
        tax_cents: 0, // We don't store tax separately
        total_cents: order.total_cents,
        currency: 'usd',
        status: order.status,
        tracking_number: order.tracking_number,
        tracking_carrier: order.tracking_number ? 'fedex' : null,
        created_at: order.created_at,
        items: order.items || []
      };
    } catch (error) {
      console.error('Error fetching order:', error);
      return null;
    }
  }
};
