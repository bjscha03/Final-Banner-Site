/**
 * Google Analytics 4 Event Tracking
 * 
 * Comprehensive event tracking for e-commerce, design tools, AI generation, and user behavior.
 * All events follow GA4 recommended event format.
 */

// Extend Window interface to include gtag
declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'set' | 'js',
      targetOrAction: string | Date,
      params?: Record<string, any>
    ) => void;
    dataLayer?: any[];
  }
}

/**
 * Helper to safely call gtag
 */
const gtag = (...args: any[]) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...args as any);
  }
};

// ============================================================================
// E-COMMERCE EVENTS (GA4 Standard)
// ============================================================================

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
}

/**
 * Track when user adds item to cart
 */
export const trackAddToCart = (item: {
  id: string;
  name: string;
  material: string;
  size: string;
  price: number;
  quantity?: number;
}) => {
  gtag('event', 'add_to_cart', {
    currency: 'USD',
    value: item.price / 100, // Convert cents to dollars
    items: [{
      item_id: item.id,
      item_name: `${item.size} ${item.material} Banner`,
      item_category: 'Banner',
      item_variant: item.material,
      price: item.price / 100,
      quantity: item.quantity || 1,
    }]
  });
};

/**
 * Track when user begins checkout
 */
export const trackBeginCheckout = (items: AnalyticsItem[], totalValue: number) => {
  gtag('event', 'begin_checkout', {
    currency: 'USD',
    value: totalValue / 100,
    items: items.map(item => ({
      ...item,
      price: item.price / 100,
    }))
  });
};

/**
 * Track completed purchase (CRITICAL for revenue tracking)
 */
export const trackPurchase = (params: {
  transaction_id: string;
  value: number;
  tax?: number;
  shipping?: number;
  items: AnalyticsItem[];
}) => {
  gtag('event', 'purchase', {
    transaction_id: params.transaction_id,
    currency: 'USD',
    value: params.value / 100,
    tax: (params.tax || 0) / 100,
    shipping: (params.shipping || 0) / 100,
    items: params.items.map(item => ({
      ...item,
      price: item.price / 100,
    }))
  });
};

/**
 * Track when user views a product/design page
 */
export const trackViewItem = (item: {
  id?: string;
  name: string;
  category: string;
}) => {
  gtag('event', 'view_item', {
    items: [{
      item_id: item.id || 'new_design',
      item_name: item.name,
      item_category: item.category,
    }]
  });
};

/**
 * Track when user views cart
 */
export const trackViewCart = (items: AnalyticsItem[], totalValue: number) => {
  gtag('event', 'view_cart', {
    currency: 'USD',
    value: totalValue / 100,
    items: items.map(item => ({
      ...item,
      price: item.price / 100,
    }))
  });
};

// ============================================================================
// DESIGN TOOL EVENTS
// ============================================================================

/**
 * Track when user starts designing a banner
 */
export const trackDesignStarted = (page: 'manual' | 'ai') => {
  gtag('event', 'design_started', {
    design_type: page,
  });
};

/**
 * Track material selection
 */
export const trackMaterialSelected = (material: string) => {
  gtag('event', 'material_selected', {
    material_type: material,
  });
};

/**
 * Track size selection
 */
export const trackSizeSelected = (size: string) => {
  gtag('event', 'size_selected', {
    banner_size: size,
  });
};

/**
 * Track image upload
 */
export const trackImageUploaded = (source: 'file' | 'url' | 'ai') => {
  gtag('event', 'image_uploaded', {
    upload_source: source,
  });
};

/**
 * Track text addition
 */
export const trackTextAdded = () => {
  gtag('event', 'text_added', {
    feature: 'text_tool',
  });
};

// ============================================================================
// AI GENERATION EVENTS
// ============================================================================

/**
 * Track AI generation request
 */
export const trackAIGenerationStarted = (params: {
  prompt_length: number;
  has_style?: boolean;
}) => {
  gtag('event', 'ai_generation_started', {
    prompt_length: params.prompt_length,
    has_style: params.has_style || false,
  });
};

/**
 * Track successful AI generation
 */
export const trackAIGenerationSuccess = (params: {
  images_generated: number;
  generation_time?: number;
}) => {
  gtag('event', 'ai_generation_success', {
    images_count: params.images_generated,
    generation_time_ms: params.generation_time,
  });
};

/**
 * Track failed AI generation
 */
export const trackAIGenerationFailed = (reason: string) => {
  gtag('event', 'ai_generation_failed', {
    failure_reason: reason,
  });
};

/**
 * Track when user selects an AI-generated image
 */
export const trackAIImageSelected = (imageIndex: number) => {
  gtag('event', 'ai_image_selected', {
    image_index: imageIndex,
  });
};

/**
 * Track AI credit usage
 */
export const trackAICreditUsed = (creditsRemaining: number) => {
  gtag('event', 'ai_credit_used', {
    credits_remaining: creditsRemaining,
  });
};

// ============================================================================
// PAYMENT EVENTS
// ============================================================================

/**
 * Track payment method selection
 */
export const trackPaymentMethodSelected = (method: 'paypal' | 'test') => {
  gtag('event', 'payment_method_selected', {
    payment_method: method,
  });
};

/**
 * Track payment failure
 */
export const trackPaymentFailed = (params: {
  reason: string;
  amount: number;
}) => {
  gtag('event', 'payment_failed', {
    failure_reason: params.reason,
    amount: params.amount / 100,
    currency: 'USD',
  });
};

/**
 * Track payment success
 */
export const trackPaymentSuccess = (params: {
  amount: number;
  payment_method: string;
}) => {
  gtag('event', 'payment_success', {
    amount: params.amount / 100,
    currency: 'USD',
    payment_method: params.payment_method,
  });
};

// ============================================================================
// USER EVENTS
// ============================================================================

/**
 * Track user sign up
 */
export const trackSignUp = (method: 'email' | 'google' | 'other') => {
  gtag('event', 'sign_up', {
    method: method,
  });
};

/**
 * Track user login
 */
export const trackLogin = (method: 'email' | 'google' | 'other') => {
  gtag('event', 'login', {
    method: method,
  });
};

/**
 * Track page view (enhanced)
 */
export const trackPageView = (params: {
  page_title: string;
  page_path: string;
}) => {
  gtag('event', 'page_view', {
    page_title: params.page_title,
    page_location: window.location.href,
    page_path: params.page_path,
  });
};

// ============================================================================
// CUSTOM BUSINESS EVENTS
// ============================================================================

/**
 * Track quote request (for large orders)
 */
export const trackQuoteRequested = (params: {
  square_feet: number;
  material: string;
}) => {
  gtag('event', 'quote_requested', {
    square_feet: params.square_feet,
    material: params.material,
  });
};

/**
 * Track shipping info entered
 */
export const trackShippingInfoEntered = () => {
  gtag('event', 'add_shipping_info', {
    shipping_tier: 'free_next_day',
  });
};

// ============================================================================
// FACEBOOK PIXEL EVENTS
// ============================================================================

/**
 * Helper to safely call Facebook Pixel
 */
const fbq = (...args: any[]) => {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq(...args);
  }
};

/**
 * Track Facebook Pixel ViewContent event
 */
export const trackFBViewContent = (params: {
  content_name: string;
  content_category?: string;
  value?: number;
  currency?: string;
}) => {
  fbq('track', 'ViewContent', {
    content_name: params.content_name,
    content_category: params.content_category || 'Banner',
    value: params.value ? params.value / 100 : undefined,
    currency: params.currency || 'USD',
  });
};

/**
 * Track Facebook Pixel AddToCart event
 */
export const trackFBAddToCart = (params: {
  content_name: string;
  value: number;
  currency?: string;
}) => {
  fbq('track', 'AddToCart', {
    content_name: params.content_name,
    value: params.value / 100,
    currency: params.currency || 'USD',
  });
};

/**
 * Track Facebook Pixel InitiateCheckout event
 */
export const trackFBInitiateCheckout = (params: {
  value: number;
  currency?: string;
  num_items: number;
}) => {
  fbq('track', 'InitiateCheckout', {
    value: params.value / 100,
    currency: params.currency || 'USD',
    num_items: params.num_items,
  });
};

/**
 * Track Facebook Pixel Purchase event (CRITICAL for conversion tracking)
 */
export const trackFBPurchase = (params: {
  value: number;
  currency?: string;
  transaction_id: string;
}) => {
  fbq('track', 'Purchase', {
    value: params.value / 100,
    currency: params.currency || 'USD',
    transaction_id: params.transaction_id,
  });
};

/**
 * Track Facebook Pixel Lead event (for quote requests)
 */
export const trackFBLead = () => {
  fbq('track', 'Lead');
};

/**
 * Track Facebook Pixel CompleteRegistration event
 */
export const trackFBCompleteRegistration = () => {
  fbq('track', 'CompleteRegistration');
};
