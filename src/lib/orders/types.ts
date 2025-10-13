export type MaterialKey = '13oz' | '15oz' | '18oz' | 'mesh';
export type OrderStatus = 'paid' | 'pending' | 'failed' | 'refunded' | 'shipped';
export type TrackingCarrier = 'fedex';

export interface OrderItem {
  width_in: number;
  height_in: number;
  quantity: number;
  material: MaterialKey;
  grommets?: string;
  rope_feet?: number;
  pole_pockets?: string;
  pole_pocket_size?: string;
  pole_pocket_position?: string;
  pole_pocket_cost_cents?: number;
  pole_pocket_pricing_mode?: 'per_item' | 'per_order';
  rope_cost_cents?: number;
  rope_pricing_mode?: 'per_item' | 'per_order';
  area_sqft: number;
  unit_price_cents: number;
  line_total_cents: number;
  file_key?: string;
  file_name?: string;
  file_url?: string;
  print_ready_url?: string;
  web_preview_url?: string;
  text_elements?: any[];
  overlay_image?: any;
  transform?: any;
  preview_canvas_px?: any;
}

export interface Order {
  id: string;
  user_id: string | null;
  email?: string; // Customer email for guest orders
  status: OrderStatus;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: 'usd';
  created_at: string;
  items: OrderItem[];
  tracking_number?: string | null;
  tracking_carrier?: TrackingCarrier | null;
  shipping_notification_sent?: boolean;
  shipping_notification_sent_at?: string | null;
}

export interface CreateOrderData {
  user_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: 'usd';
  items: OrderItem[];
}

export interface OrdersAdapter {
  create(order: CreateOrderData): Promise<Order>;
  listByUser(userId: string, page?: number): Promise<Order[]>;
  listAll(page?: number): Promise<Order[]>;
  appendTracking(id: string, carrier: TrackingCarrier, number: string): Promise<void>;
  updateTracking(id: string, carrier: TrackingCarrier, number: string): Promise<void>;
  get(id: string): Promise<Order | null>;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  is_admin?: boolean;
}

export interface AuthAdapter {
  getCurrentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
}

export const fedexUrl = (n: string) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`;

// Utility types for cart integration
export interface CartItem {
  widthIn: number;
  heightIn: number;
  quantity: number;
  material: MaterialKey;
  grommets: string;
  ropeFeet: number;
  fileKey?: string;
}

// Email types
export interface OrderConfirmationEmail {
  to: string;
  order: Order;
}

export interface EmailAdapter {
  sendOrderConfirmation(data: OrderConfirmationEmail): Promise<boolean>;
}
