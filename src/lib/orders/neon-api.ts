import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

// Neon Data API endpoint
const NEON_API_ENDPOINT = 'https://ep-delicate-sea-aebekqeo.apirest.c-2.us-east-2.aws.neon.tech/neondb/rest/v1';

export const neonApiOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    try {
      console.log('Creating order with Neon Data API:', orderData);

      // Generate a UUID for the order
      const orderId = crypto.randomUUID();
      
      // Insert order using Neon Data API
      const orderResponse = await fetch(`${NEON_API_ENDPOINT}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: orderId,
          user_id: orderData.user_id,
          email: 'guest@example.com', // Default for guest orders
          subtotal_cents: orderData.subtotal_cents,
          tax_cents: orderData.tax_cents,
          total_cents: orderData.total_cents,
          status: 'paid',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });

      if (!orderResponse.ok) {
        const errorText = await orderResponse.text();
        console.error('Failed to create order:', errorText);
        throw new Error(`Failed to create order: ${orderResponse.status} ${errorText}`);
      }

      console.log('Order created successfully');

      // Insert order items
      for (const item of orderData.items) {
        const itemResponse = await fetch(`${NEON_API_ENDPOINT}/order_items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            order_id: orderId,
            width_in: item.width_in,
            height_in: item.height_in,
            quantity: item.quantity,
            material: item.material,
            grommets: item.grommets || 'none',
            rope_feet: item.rope_feet || 0,
            pole_pockets: 'none', // Default value
            line_total_cents: item.line_total_cents,
            created_at: new Date().toISOString()
          })
        });

        if (!itemResponse.ok) {
          const errorText = await itemResponse.text();
          console.error('Failed to create order item:', errorText);
          throw new Error(`Failed to create order item: ${itemResponse.status} ${errorText}`);
        }
      }

      console.log('All order items created successfully');

      // Return the order object
      return {
        id: orderId,
        user_id: orderData.user_id,
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: orderData.total_cents,
        status: 'paid',
        currency: orderData.currency,
        tracking_number: null,
        tracking_carrier: null,
        created_at: new Date().toISOString(),
        items: orderData.items
      };
    } catch (error) {
      console.error('Error creating order with Neon Data API:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  },

  listByUser: async (userId: string, page = 1): Promise<Order[]> => {
    try {
      const response = await fetch(`${NEON_API_ENDPOINT}/orders?user_id=eq.${userId}&order=created_at.desc&limit=10&offset=${(page - 1) * 10}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      const orders = await response.json();
      
      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order: any) => {
          const itemsResponse = await fetch(`${NEON_API_ENDPOINT}/order_items?order_id=eq.${order.id}`, {
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          const items = itemsResponse.ok ? await itemsResponse.json() : [];
          
          return {
            ...order,
            items: items.map((item: any) => ({
              width_in: item.width_in,
              height_in: item.height_in,
              quantity: item.quantity,
              material: item.material,
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
      console.error('Error fetching orders:', error);
      return [];
    }
  },

  listAll: async (page = 1): Promise<Order[]> => {
    try {
      const response = await fetch(`${NEON_API_ENDPOINT}/orders?order=created_at.desc&limit=10&offset=${(page - 1) * 10}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      const orders = await response.json();
      
      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order: any) => {
          const itemsResponse = await fetch(`${NEON_API_ENDPOINT}/order_items?order_id=eq.${order.id}`, {
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          const items = itemsResponse.ok ? await itemsResponse.json() : [];
          
          return {
            ...order,
            items: items.map((item: any) => ({
              width_in: item.width_in,
              height_in: item.height_in,
              quantity: item.quantity,
              material: item.material,
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
      console.error('Error fetching orders:', error);
      return [];
    }
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    try {
      const response = await fetch(`${NEON_API_ENDPOINT}/orders?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking_number: number,
          // tracking_carrier: carrier, // Column doesn't exist in database schema
          status: 'shipped', // Update status to shipped when tracking is added
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to update tracking: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw error;
    }
  },

  updateTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    try {
      const response = await fetch(`${NEON_API_ENDPOINT}/orders?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking_number: number,
          // tracking_carrier: carrier, // Column doesn't exist in database schema
          // Don't change status when updating existing tracking
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to update tracking: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw error;
    }
  },

  get: async (id: string): Promise<Order | null> => {
    try {
      const response = await fetch(`${NEON_API_ENDPOINT}/orders?id=eq.${id}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        return null;
      }

      const orders = await response.json();
      if (orders.length === 0) {
        return null;
      }

      const order = orders[0];

      // Fetch order items
      const itemsResponse = await fetch(`${NEON_API_ENDPOINT}/order_items?order_id=eq.${id}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const items = itemsResponse.ok ? await itemsResponse.json() : [];
      
      return {
        ...order,
        items: items.map((item: any) => ({
          width_in: item.width_in,
          height_in: item.height_in,
          quantity: item.quantity,
          material: item.material,
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
