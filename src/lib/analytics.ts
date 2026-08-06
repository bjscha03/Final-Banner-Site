/**
 * Google Analytics 4 Event Tracking
 * 
 * Comprehensive event tracking for e-commerce, design tools, AI generation, and user behavior.
 * All events follow GA4 recommended event format.
 */

import { sendGtag, sendLinkedIn, sendMeta } from './trackingRuntime';

/**
 * Helper to safely call gtag
 */
export const gtag = (...args: unknown[]): boolean => sendGtag(...args);

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
  coupon?: string;
  discount?: number;
  item_list_id?: string;
  item_list_name?: string;
}

const toGA4Item = (item: AnalyticsItem) => ({
  ...item,
  price: item.price / 100,
  ...(typeof item.discount === 'number' ? { discount: item.discount / 100 } : {}),
});

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
  productType?: string;
}) => {
  const normalizedType = item.productType || 'banner';
  const productLabel = normalizedType === 'yard_sign'
    ? 'Yard Sign'
    : normalizedType === 'car_magnet'
      ? 'Car Magnet'
      : normalizedType === 'design_deposit'
        ? 'Design Service'
        : normalizedType === 'graduation_final_payment'
          ? 'Graduation Final Payment'
          : 'Banner';
  const quantity = Math.max(1, Number(item.quantity || 1));
  return gtag('event', 'add_to_cart', {
    currency: 'USD',
    value: item.price / 100,
    items: [{
      item_id: item.id,
      item_name: item.name || `${item.size} ${item.material} ${productLabel}`,
      item_category: productLabel,
      item_variant: item.material,
      // Call sites pass the authoritative line total. GA4 item price must be
      // the per-unit amount or quantity would multiply revenue a second time.
      price: Math.round(item.price / quantity) / 100,
      quantity,
    }]
  });
};

/**
 * Track when user begins checkout
 */
export const trackBeginCheckout = (items: AnalyticsItem[], totalValue: number, coupon?: string | null) => {
  return gtag('event', 'begin_checkout', {
    currency: 'USD',
    value: totalValue / 100,
    ...(coupon ? { coupon } : {}),
    items: items.map(toGA4Item),
  });
};

/**
 * Track Google Ads purchase conversion (separate from GA4 purchase event).
 *
 * Reads the conversion ID and purchase label from Vite env vars:
 *   - VITE_GOOGLE_ADS_CONVERSION_ID  (e.g. "AW-1234567890")
 *   - VITE_GOOGLE_ADS_PURCHASE_LABEL (e.g. "abcDEFghiJKL")
 *
 * If either is missing the function is a no-op so we never fire fake conversions.
 * Caller is responsible for ensuring it only fires once per successful order.
 */
export const trackGoogleAdsPurchaseConversion = (params: {
  transaction_id: string;
  value: number; // cents
  currency?: string;
}) => {
  const conversionId = import.meta.env.VITE_GOOGLE_ADS_CONVERSION_ID;
  const purchaseLabel = import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL;
  if (!conversionId || !purchaseLabel) {
    return false;
  }
  return gtag('event', 'conversion', {
    send_to: `${conversionId}/${purchaseLabel}`,
    value: params.value / 100,
    currency: params.currency || 'USD',
    transaction_id: params.transaction_id,
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
  coupon?: string | null;
}) => {
  return gtag('event', 'purchase', {
    transaction_id: params.transaction_id,
    currency: 'USD',
    value: params.value / 100,
    tax: (params.tax || 0) / 100,
    shipping: (params.shipping || 0) / 100,
    ...(params.coupon ? { coupon: params.coupon } : {}),
    items: params.items.map(toGA4Item),
  });
};

/**
 * Track when user views a product/design page
 */
export const trackViewItem = (item: {
  id: string;
  name: string;
  category: string;
  variant?: string;
  price: number;
  quantity?: number;
}) => {
  const quantity = Math.max(1, item.quantity || 1);
  return gtag('event', 'view_item', {
    currency: 'USD',
    value: (item.price * quantity) / 100,
    items: [{
      item_id: item.id,
      item_name: item.name,
      item_category: item.category,
      item_variant: item.variant,
      price: item.price / 100,
      quantity,
    }]
  });
};

export const trackViewItemList = (params: {
  item_list_id: string;
  item_list_name: string;
  items: AnalyticsItem[];
}) => gtag('event', 'view_item_list', {
  item_list_id: params.item_list_id,
  item_list_name: params.item_list_name,
  items: params.items.map(toGA4Item),
});

export const trackSelectItem = (params: {
  item_list_id: string;
  item_list_name: string;
  item: AnalyticsItem;
}) => gtag('event', 'select_item', {
  item_list_id: params.item_list_id,
  item_list_name: params.item_list_name,
  items: [toGA4Item(params.item)],
});

/**
 * Track when user views cart
 */
export const trackViewCart = (items: AnalyticsItem[], totalValue: number, coupon?: string | null) => {
  return gtag('event', 'view_cart', {
    currency: 'USD',
    value: totalValue / 100,
    ...(coupon ? { coupon } : {}),
    items: items.map(toGA4Item),
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
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bannersonthefly.com';
  return gtag('event', 'page_view', {
    page_title: params.page_title,
    page_location: `${origin}${params.page_path}`,
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
export const trackShippingInfoEntered = (params: {
  items: AnalyticsItem[];
  value: number;
  coupon?: string | null;
  shippingTier?: string;
}) => {
  return gtag('event', 'add_shipping_info', {
    currency: 'USD',
    value: params.value / 100,
    shipping_tier: params.shippingTier || 'free_next_day_air_after_production',
    ...(params.coupon ? { coupon: params.coupon } : {}),
    items: params.items.map(toGA4Item),
  });
};

export const trackPaymentInfoAdded = (params: {
  paymentType: 'paypal' | 'card' | 'stripe';
  items: AnalyticsItem[];
  value: number;
  coupon?: string | null;
}) => gtag('event', 'add_payment_info', {
  currency: 'USD',
  value: params.value / 100,
  payment_type: params.paymentType,
  ...(params.coupon ? { coupon: params.coupon } : {}),
  items: params.items.map(toGA4Item),
});

// ============================================================================
// FACEBOOK PIXEL EVENTS
// ============================================================================

/**
 * Helper to safely call Facebook Pixel
 */
const fbq = (...args: unknown[]): boolean => sendMeta(...args);

/** Track one Meta page view for each eligible SPA navigation. */
export const trackFBPageView = () => fbq('track', 'PageView');

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
  return fbq('track', 'Purchase', {
    value: params.value / 100,
    currency: params.currency || 'USD',
    transaction_id: params.transaction_id,
    content_type: 'product',
  }, { eventID: params.transaction_id });
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

// ============================================================================
// LINKEDIN INSIGHT TAG EVENTS
// ============================================================================

/**
 * Helper to safely call LinkedIn Insight Tag
 */
const lintrk = (...args: unknown[]): boolean => sendLinkedIn(...args);

/**
 * Track LinkedIn conversion event
 */
export const trackLinkedInConversion = (conversionId: number) => {
  lintrk('track', { conversion_id: conversionId });
};

/**
 * Track LinkedIn custom event
 */
export const trackLinkedInEvent = (eventName: string) => {
  lintrk('track', { event_name: eventName });
};
