import {
  Order,
  OrdersAdapter,
  CreateOrderData,
  TrackingCarrier,
  type AdminOrdersReportQuery,
  type AdminOrdersReportResponse,
} from './types';
import { adminFetch } from '@/lib/serverAuth';

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

export const fetchAdminOrdersReport = async (
  query: AdminOrdersReportQuery = {},
  options: { signal?: AbortSignal } = {},
): Promise<AdminOrdersReportResponse> => {
  const parameters = new URLSearchParams({
    admin_report: '1',
    page: String(Math.max(1, Math.trunc(Number(query.page) || 1))),
    page_size: String(Math.min(20, Math.max(1, Math.trunc(Number(query.pageSize) || 20)))),
  });
  const search = String(query.search || '').trim();
  if (search) parameters.set('search', search.slice(0, 200));
  if (query.start && query.endExclusive) {
    parameters.set('start', query.start);
    parameters.set('end', query.endExclusive);
  }
  if (query.summaryOnly) parameters.set('summary', '1');

  const response = await adminFetch(
    getNetlifyFunctionUrl(`get-orders?${parameters.toString()}`),
    { cache: 'no-store', signal: options.signal },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load the order report');
  }
  if (!data || !Array.isArray(data.orders) || !data.pagination || !data.metrics || !data.overview) {
    throw new Error('The order report returned an invalid response');
  }
  return data as AdminOrdersReportResponse;
};

export const fetchAdminOrderDetail = async (
  orderId: string,
  options: { signal?: AbortSignal } = {},
): Promise<Order> => {
  const response = await adminFetch(
    getNetlifyFunctionUrl(`get-order?id=${encodeURIComponent(orderId)}`),
    { cache: 'no-store', signal: options.signal },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'Failed to load order details');
  const order = data.order || data;
  if (!order?.id || !Array.isArray(order.items)) throw new Error('The order detail response was invalid');
  return order as Order;
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
    console.log('Fetching orders for user:', userId);
    const response = await adminFetch(getNetlifyFunctionUrl(`get-orders?user_id=${userId}&page=${page}`), {
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Failed to fetch orders:', response.status, errorData);
      throw new Error(`Failed to fetch orders: ${response.status} – ${errorData.error || errorData.details || 'Unknown error'}`);
    }

    const orders = await response.json();
    console.log('Orders fetched successfully:', orders.length, 'orders');
    return orders;
  },

  listAll: async (page = 1): Promise<Order[]> => {
    const response = await adminFetch(getNetlifyFunctionUrl(`get-orders?page=${page}`), {
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Failed to fetch all orders:', response.status, errorData);
      throw new Error(`Failed to fetch orders: ${response.status} – ${errorData.error || errorData.details || 'Unknown error'}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      console.error('get-orders returned non-array:', typeof data, data);
      throw new Error('get-orders did not return an array');
    }
    return data;
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string, trackingNumbers?: any[]): Promise<void> => {
    try {
      const response = await adminFetch(getNetlifyFunctionUrl('update-tracking'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, carrier, number, trackingNumbers, isUpdate: false })
      });

      if (!response.ok) {
        throw new Error(`Failed to update tracking: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw error;
    }
  },

  updateTracking: async (id: string, carrier: TrackingCarrier, number: string, trackingNumbers?: any[]): Promise<void> => {
    try {
      const response = await adminFetch(getNetlifyFunctionUrl('update-tracking'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, carrier, number, trackingNumbers, isUpdate: true })
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
      return await fetchAdminOrderDetail(id);
    } catch (error) {
      console.error('Error fetching order:', error);
      return null;
    }
  }
};
