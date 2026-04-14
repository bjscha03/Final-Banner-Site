export type MaterialKey = '13oz' | '15oz' | '18oz' | 'mesh' | 'corrugated' | 'aluminum_040' | 'aluminum_063';
export type OrderStatus = 'paid' | 'pending' | 'failed' | 'refunded' | 'shipped';
export type TrackingCarrier = 'fedex';

export interface DesignServiceAsset {
  name: string;
  type: string;
  size: number;
  url: string;
  fileKey?: string;
}

export interface OrderItem {
  product_type?: string;       // Product type slug (default: 'banner')
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

  // Design Service fields - "Let Our Team Design It" flow
  design_service_enabled?: boolean;
  design_request_text?: string;
  design_draft_preference?: 'email' | 'text';
  design_draft_contact?: string;
  design_uploaded_assets?: DesignServiceAsset[];
  final_print_pdf_url?: string;
  final_print_pdf_file_key?: string;
  final_print_pdf_uploaded_at?: string;

  // FINAL_RENDER: High-res canvas snapshot for admin JPEG export
  final_render_url?: string;
  final_render_file_key?: string;
  final_render_width_px?: number;
  final_render_height_px?: number;
  final_render_dpi?: number;

  // Additional fields for cart/checkout
  thumbnail_url?: string;
  canvas_background_color?: string;
  image_scale?: number;
  image_position?: { x: number; y: number };
  fit_mode?: 'fill' | 'fit' | 'stretch';
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
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_street2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  shipping_country?: string | null;
  applied_discount_cents?: number;
  applied_discount_label?: string;
  applied_discount_type?: string;
}

export interface CreateOrderData {
  user_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: 'usd';
  items: OrderItem[];
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  shipping_country?: string | null;
  applied_discount_cents?: number;
  applied_discount_label?: string;
  applied_discount_type?: string;
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
