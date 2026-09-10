import { Order, OrdersAdapter, CreateOrderData, TrackingCarrier } from './types';

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
      const sampleOrders: Order[] = [
        {
          id: 'ord_1234567890abcdef',
          user_id: 'user_123',
          status: 'paid',
          total_cents: 7800,
          currency: 'usd',
          created_at: new Date().toISOString(),
          items: [
            {
              width_in: 48,
              height_in: 26,
              quantity: 2,
              material: '13oz',
              area_sqft: 8.67,
              unit_price_cents: 3900,
              line_total_cents: 7800,
              grommets: 'every-2-3ft',
              rope_feet: 8,
              file_key: 'uploads/banner-design.jpg'
            }
          ],
          tracking_number: null,
          tracking_carrier: null
        },
        {
          id: 'ord_fedcba0987654321',
          user_id: 'user_456',
          status: 'paid',
          total_cents: 12500,
          currency: 'usd',
          created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          items: [
            {
              width_in: 72,
              height_in: 36,
              quantity: 1,
              material: '15oz',
              area_sqft: 18,
              unit_price_cents: 12500,
              line_total_cents: 12500,
              grommets: '4-corners',
              file_key: 'uploads/company-logo.png'
            }
          ],
          tracking_number: '1234567890',
          tracking_carrier: 'fedex'
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
  async create(orderData: CreateOrderData): Promise<Order> {
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

  async listByUser(userId: string, page = 1): Promise<Order[]> {
    const orders = getStoredOrders();
    const userOrders = orders.filter(order => order.user_id === userId);

    // Simple pagination (20 per page)
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return userOrders.slice(start, end);
  },

  async listAll(page = 1): Promise<Order[]> {
    const orders = getStoredOrders();

    // Simple pagination (20 per page)
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return orders.slice(start, end);
  },

  async appendTracking(id: string, carrier: TrackingCarrier, number: string): Promise<void> {
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

  async get(id: string): Promise<Order | null> {
    const orders = getStoredOrders();
    return orders.find(order => order.id === id) || null;
  },
};
