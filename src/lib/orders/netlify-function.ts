import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

export const netlifyFunctionOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    try {
      console.log('Creating order with Netlify function:', orderData);

      const response = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to create order:', errorData);
        throw new Error(`Failed to create order: ${response.status} ${errorData.error || 'Unknown error'}`);
      }

      const order = await response.json();
      console.log('Order created successfully:', order);
      return order;
    } catch (error) {
      console.error('Error creating order with Netlify function:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  },

  listByUser: async (userId: string, page = 1): Promise<Order[]> => {
    try {
      const response = await fetch(`/.netlify/functions/get-orders?user_id=${userId}&page=${page}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  },

  listAll: async (page = 1): Promise<Order[]> => {
    try {
      const response = await fetch(`/.netlify/functions/get-orders?page=${page}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    try {
      const response = await fetch('/.netlify/functions/update-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, carrier, number })
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
      const response = await fetch(`/.netlify/functions/get-order?id=${id}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch order: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching order:', error);
      return null;
    }
  }
};
