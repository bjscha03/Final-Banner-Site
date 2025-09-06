import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';
import { calculateTax, calculateTotalWithTax } from '@/lib/pricing';

const ORDERS_STORAGE_KEY = 'banners_orders';

// Generate a simple UUID for development
function generateId(): string {
  return 'order_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Get orders from localStorage
function getStoredOrders(): Order[] {
  try {
    const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
    const orders = stored ? JSON.parse(stored) : [];

    // If no orders exist, create some sample data
    if (orders.length === 0) {
      // Get current user from localStorage to match sample orders
      const currentUserStr = localStorage.getItem('banners_current_user');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      const sampleUserId = currentUser?.id || 'dev_user_123';

      const sampleOrders: Order[] = [
        {
          id: '#MF7Q79BQ',
          user_id: sampleUserId,
          status: 'paid',
          subtotal_cents: 3600,
          tax_cents: 216, // 6% of 3600
          total_cents: 3816,
          currency: 'usd',
          created_at: new Date().toISOString(),
          items: [
            {
              width_in: 48,
              height_in: 24,
              quantity: 1,
              material: '13oz',
              area_sqft: 8,
              unit_price_cents: 3600,
              line_total_cents: 3600,
              grommets: 'every-2-3ft',
              rope_feet: 0,
              file_key: 'uploads/banner-design.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: '#MF7PG4UM',
          user_id: sampleUserId,
          status: 'paid',
          subtotal_cents: 1097,
          tax_cents: 66, // 6% of 1097
          total_cents: 1163,
          currency: 'usd',
          created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          items: [
            {
              width_in: 27,
              height_in: 13,
              quantity: 1,
              material: '13oz',
              area_sqft: 2.44,
              unit_price_cents: 1097,
              line_total_cents: 1097,
              grommets: '4-corners',
              rope_feet: 0,
              file_key: 'uploads/company-logo.png'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: '#MF7PDJ8B',
          user_id: sampleUserId,
          status: 'paid',
          subtotal_cents: 7200,
          tax_cents: 432, // 6% of 7200
          total_cents: 7632,
          currency: 'usd',
          created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
          items: [
            {
              width_in: 48,
              height_in: 24,
              quantity: 2,
              material: '13oz',
              area_sqft: 8,
              unit_price_cents: 3600,
              line_total_cents: 7200,
              grommets: 'every-2-3ft',
              rope_feet: 0,
              file_key: 'uploads/event-banner.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: '#MF7PX5F',
          user_id: 'dev_user_123',
          status: 'paid',
          subtotal_cents: 3600,
          tax_cents: 216, // 6% of 3600
          total_cents: 3816,
          currency: 'usd',
          created_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
          items: [
            {
              width_in: 48,
              height_in: 24,
              quantity: 1,
              material: '13oz',
              area_sqft: 8,
              unit_price_cents: 3600,
              line_total_cents: 3600,
              grommets: 'every-2-3ft',
              rope_feet: 0,
              file_key: 'uploads/sale-banner.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: '#MF7PGQBT',
          user_id: 'dev_user_123',
          status: 'paid',
          subtotal_cents: 3600,
          tax_cents: 216, // 6% of 3600
          total_cents: 3816,
          currency: 'usd',
          created_at: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
          items: [
            {
              width_in: 48,
              height_in: 24,
              quantity: 1,
              material: '13oz',
              area_sqft: 8,
              unit_price_cents: 3600,
              line_total_cents: 3600,
              grommets: 'every-2-3ft',
              rope_feet: 0,
              file_key: 'uploads/promo-banner.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: '#MF7P3JLA',
          user_id: 'dev_user_123',
          status: 'paid',
          subtotal_cents: 7200,
          tax_cents: 432, // 6% of 7200
          total_cents: 7632,
          currency: 'usd',
          created_at: new Date(Date.now() - 432000000).toISOString(), // 5 days ago
          items: [
            {
              width_in: 48,
              height_in: 24,
              quantity: 2,
              material: '13oz',
              area_sqft: 8,
              unit_price_cents: 3600,
              line_total_cents: 7200,
              grommets: 'every-2-3ft',
              rope_feet: 0,
              file_key: 'uploads/multi-banner.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: '#MF7P29X5',
          user_id: 'dev_user_123',
          status: 'paid',
          subtotal_cents: 13200,
          tax_cents: 792, // 6% of 13200
          total_cents: 13992,
          currency: 'usd',
          created_at: new Date(Date.now() - 518400000).toISOString(), // 6 days ago
          items: [
            {
              width_in: 48,
              height_in: 24,
              quantity: 3,
              material: '13oz',
              area_sqft: 8,
              unit_price_cents: 3600,
              line_total_cents: 10800,
              grommets: 'every-2-3ft',
              rope_feet: 0,
              file_key: 'uploads/triple-banner.jpg'
            },
            {
              width_in: 27,
              height_in: 13,
              quantity: 2,
              material: '13oz',
              area_sqft: 2.44,
              unit_price_cents: 1097,
              line_total_cents: 2194,
              grommets: '4-corners',
              rope_feet: 0,
              file_key: 'uploads/small-banners.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        }
      ];
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(sampleOrders));
      return sampleOrders;
    }

    return orders;
  } catch (error) {
    console.error('Error reading orders from localStorage:', error);
    return [];
  }
}

// Save orders to localStorage
function saveOrders(orders: Order[]): void {
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch (error) {
    console.error('Error saving orders to localStorage:', error);
  }
}

export const localOrdersAdapter: OrdersAdapter = {
  create: async (orderData: CreateOrderData): Promise<Order> => {
    const order: Order = {
      id: generateId(),
      ...orderData,
      status: 'paid', // In dev mode, assume payment succeeded
      created_at: new Date().toISOString(),
      tracking_number: null,
      tracking_carrier: null,
    };

    const orders = getStoredOrders();
    orders.unshift(order); // Add to beginning for chronological order
    saveOrders(orders);

    return order;
  },

  listByUser: async (userId: string, page = 1): Promise<Order[]> => {
    const orders = getStoredOrders();
    const userOrders = orders.filter(order => order.user_id === userId);
    
    // Simple pagination (20 per page)
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return userOrders.slice(start, end);
  },

  listAll: async (page = 1): Promise<Order[]> => {
    const orders = getStoredOrders();
    
    // Simple pagination (20 per page)
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return orders.slice(start, end);
  },

  appendTracking: async (id: string, carrier: TrackingCarrier, number: string): Promise<void> => {
    const orders = getStoredOrders();
    const orderIndex = orders.findIndex(order => order.id === id);
    
    if (orderIndex === -1) {
      throw new Error(`Order ${id} not found`);
    }

    orders[orderIndex] = {
      ...orders[orderIndex],
      tracking_carrier: carrier,
      tracking_number: number,
    };

    saveOrders(orders);
  },

  get: async (id: string): Promise<Order | null> => {
    const orders = getStoredOrders();
    return orders.find(order => order.id === id) || null;
  },
};
