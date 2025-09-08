import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

// Get the correct base URL for Netlify functions
const getNetlifyFunctionUrl = (functionName: string): string => {
  // In development, Netlify functions run on port 8888
  // In production, they're available at the same domain
  if (typeof window !== 'undefined') {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) {
      return `http://localhost:8888/.netlify/functions/${functionName}`;
    }
  }
  return `/.netlify/functions/${functionName}`;
};

export const netlifyFunctionOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    try {
      console.log('Creating order with Netlify function:', orderData);

      const response = await fetch(getNetlifyFunctionUrl('create-order'), {
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

      const responseData = await response.json();
      console.log('Order response received:', responseData);

      // Handle the response format from create-order function
      if (responseData.ok && responseData.order) {
        console.log('Order created successfully:', responseData.order);
        return responseData.order;
      } else if (responseData.ok === false) {
        throw new Error(`Failed to create order: ${responseData.error || 'Unknown error'} - ${responseData.details || ''}`);
      } else {
        // Fallback for direct order object response
        console.log('Order created successfully (direct format):', responseData);
        return responseData;
      }
    } catch (error) {
      console.error('Error creating order with Netlify function:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  },

  listByUser: async (userId: string, page = 1): Promise<Order[]> => {
    try {
      console.log('Fetching orders for user:', userId);
      const response = await fetch(getNetlifyFunctionUrl(`get-orders?user_id=${userId}&page=${page}`));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to fetch orders:', response.status, errorData);
        throw new Error(`Failed to fetch orders: ${response.status} ${errorData.error || 'Unknown error'}`);
      }

      const orders = await response.json();
      console.log('Orders fetched successfully:', orders.length, 'orders');
      return orders;
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  },

  listAll: async (page = 1): Promise<Order[]> => {
    try {
      const response = await fetch(getNetlifyFunctionUrl(`get-orders?page=${page}`));
      
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
      const response = await fetch(getNetlifyFunctionUrl('update-tracking'), {
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
      const response = await fetch(getNetlifyFunctionUrl(`get-order?id=${id}`));

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
