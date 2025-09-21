import { db } from '../../../db/index';
import { orders, orderItems } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

export const netlifyDbOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    try {
      
      // Insert order
      const [newOrder] = await db.insert(orders).values({
        user_id: orderData.user_id,
        email: 'guest@example.com', // Default for guest orders
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: orderData.total_cents,
        status: 'paid'
      }).returning();


      // Insert order items
      const orderItemsData = orderData.items.map(item => ({
        order_id: newOrder.id,
        width_in: item.width_in,
        height_in: item.height_in,
        quantity: item.quantity,
        material: item.material,
        grommets: item.grommets || 'none',
        rope_feet: item.rope_feet || 0,
        line_total_cents: item.line_total_cents,
        file_key: item.file_key || null
      }));

      await db.insert(orderItems).values(orderItemsData);

      return {
        id: newOrder.id,
        user_id: newOrder.user_id,
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: newOrder.total_cents,
        status: newOrder.status as any,
        currency: orderData.currency,
        tracking_number: null,
        tracking_carrier: null,
        created_at: newOrder.created_at?.toISOString() || new Date().toISOString(),
        items: orderData.items
      };
    } catch (error) {
      console.error('Error creating order with Netlify DB:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  },

  listByUser: async (userId: string, page?: number): Promise<Order[]> => {
    try {
      const userOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.user_id, userId))
        .limit(50)
        .offset(page ? (page - 1) * 50 : 0);

      const ordersWithItems = await Promise.all(
        userOrders.map(async (order) => {
          const items = await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.order_id, order.id));

          return {
            id: order.id,
            user_id: order.user_id,
            email: order.email,
            subtotal_cents: order.total_cents, // We don't store separately
            tax_cents: 0, // We don't store separately
            total_cents: order.total_cents,
            status: order.status as any,
            currency: 'usd' as const,
            tracking_number: null,
            tracking_carrier: null,
            created_at: order.created_at?.toISOString() || new Date().toISOString(),
            items: items.map(item => ({
              width_in: item.width_in,
              height_in: item.height_in,
              quantity: item.quantity,
              material: item.material as any,
              grommets: item.grommets,
              rope_feet: item.rope_feet,
              area_sqft: (item.width_in * item.height_in) / 144,
              unit_price_cents: Math.round(item.line_total_cents / item.quantity),
              line_total_cents: item.line_total_cents,
              file_key: item.file_key
            }))
          };
        })
      );

      return ordersWithItems;
    } catch (error) {
      console.error('Error fetching user orders:', error);
      return [];
    }
  },

  listAll: async (page?: number): Promise<Order[]> => {
    try {
      const allOrders = await db
        .select()
        .from(orders)
        .limit(50)
        .offset(page ? (page - 1) * 50 : 0);

      const ordersWithItems = await Promise.all(
        allOrders.map(async (order) => {
          const items = await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.order_id, order.id));

          return {
            id: order.id,
            user_id: order.user_id,
            email: order.email,
            subtotal_cents: order.total_cents,
            tax_cents: 0,
            total_cents: order.total_cents,
            status: order.status as any,
            currency: 'usd' as const,
            tracking_number: null,
            tracking_carrier: null,
            created_at: order.created_at?.toISOString() || new Date().toISOString(),
            items: items.map(item => ({
              width_in: item.width_in,
              height_in: item.height_in,
              quantity: item.quantity,
              material: item.material as any,
              grommets: item.grommets,
              rope_feet: item.rope_feet,
              area_sqft: (item.width_in * item.height_in) / 144,
              unit_price_cents: Math.round(item.line_total_cents / item.quantity),
              line_total_cents: item.line_total_cents,
              file_key: item.file_key
            }))
          };
        })
      );

      return ordersWithItems;
    } catch (error) {
      console.error('Error fetching all orders:', error);
      return [];
    }
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    try {
      await db
        .update(orders)
        .set({
          tracking_number: number,
          tracking_carrier: carrier,
          status: 'shipped', // Update status to shipped when tracking is added
          updated_at: new Date()
        })
        .where(eq(orders.id, id));
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw new Error('Failed to update tracking number');
    }
  },

  updateTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    try {
      await db
        .update(orders)
        .set({
          tracking_number: number,
          tracking_carrier: carrier,
          updated_at: new Date()
          // Don't change status when updating existing tracking
        })
        .where(eq(orders.id, id));
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw new Error('Failed to update tracking number');
    }
  },

  get: async (id: string): Promise<Order | null> => {
    try {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id));

      if (!order) return null;

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.order_id, order.id));

      return {
        id: order.id,
        user_id: order.user_id,
        email: order.email,
        subtotal_cents: order.total_cents,
        tax_cents: 0,
        total_cents: order.total_cents,
        status: order.status as any,
        currency: 'usd' as const,
        tracking_number: null,
        tracking_carrier: null,
        created_at: order.created_at?.toISOString() || new Date().toISOString(),
        items: items.map(item => ({
          width_in: item.width_in,
          height_in: item.height_in,
          quantity: item.quantity,
          material: item.material as any,
          grommets: item.grommets,
          rope_feet: item.rope_feet,
          area_sqft: (item.width_in * item.height_in) / 144,
          unit_price_cents: Math.round(item.line_total_cents / item.quantity),
          line_total_cents: item.line_total_cents,
          file_key: item.file_key
        }))
      };
    } catch (error) {
      console.error('Error fetching order:', error);
      return null;
    }
  }
};
