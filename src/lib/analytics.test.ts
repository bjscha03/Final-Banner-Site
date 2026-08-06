import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trackAddToCart,
  trackBeginCheckout,
  trackFBPageView,
  trackPageView,
  trackPaymentInfoAdded,
  trackPurchase,
  trackSelectItem,
  trackShippingInfoEntered,
  trackViewItemList,
} from './analytics';

describe('GA4 ecommerce payloads', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('window', {
      location: {
        hostname: 'bannersonthefly.com',
        pathname: '/design',
        protocol: 'https:',
        origin: 'https://bannersonthefly.com',
      },
      navigator: { webdriver: false, userAgent: 'Mozilla/5.0 Chrome/130 Safari/537.36' },
      dataLayer: [],
      gtag: vi.fn(),
    });
  });

  it('uses unit price while preserving the authoritative line value', () => {
    trackAddToCart({
      id: 'item-1',
      name: 'Two banners',
      material: '13oz',
      size: '24x48',
      price: 6800,
      quantity: 2,
    });

    expect(window.gtag).toHaveBeenCalledWith('event', 'add_to_cart', {
      currency: 'USD',
      value: 68,
      items: [expect.objectContaining({ price: 34, quantity: 2 })],
    });
  });

  it('converts cent-denominated unit prices once at checkout', () => {
    trackBeginCheckout([{
      item_id: 'item-1',
      item_name: 'Banner',
      price: 3400,
      quantity: 2,
    }], 6800, 'NEW20');

    expect(window.gtag).toHaveBeenCalledWith('event', 'begin_checkout', {
      currency: 'USD',
      value: 68,
      coupon: 'NEW20',
      items: [expect.objectContaining({ price: 34, quantity: 2 })],
    });
  });

  it('uses the sanitized route for both page path and page location', () => {
    trackPageView({ page_title: 'Paid order', page_path: '/payment-success' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_title: 'Paid order',
      page_path: '/payment-success',
      page_location: 'https://bannersonthefly.com/payment-success',
    });
  });

  it('queues an explicit Meta page view for SPA navigation', () => {
    (window as Window & { fbq?: ReturnType<typeof vi.fn> }).fbq = vi.fn();
    trackFBPageView();
    expect(window.fbq).toHaveBeenCalledWith('track', 'PageView');
  });

  it('sends product-list impressions and selections with cent values converted once', () => {
    const item = {
      item_id: 'yard-signs',
      item_name: 'Yard signs',
      item_category: 'Printing product',
      item_list_id: 'homepage_product_lines',
      item_list_name: 'Homepage product lines',
      price: 2900,
      quantity: 1,
    };

    trackViewItemList({
      item_list_id: 'homepage_product_lines',
      item_list_name: 'Homepage product lines',
      items: [item],
    });
    trackSelectItem({
      item_list_id: 'homepage_product_lines',
      item_list_name: 'Homepage product lines',
      item,
    });

    expect(window.gtag).toHaveBeenCalledWith('event', 'view_item_list', expect.objectContaining({
      items: [expect.objectContaining({ item_id: 'yard-signs', price: 29, quantity: 1 })],
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', 'select_item', expect.objectContaining({
      items: [expect.objectContaining({ item_id: 'yard-signs', price: 29, quantity: 1 })],
    }));
  });

  it('sends shipping and payment details with the same checkout ledger value', () => {
    const items = [{ item_id: 'item-1', item_name: 'Banner', price: 3400, quantity: 2 }];

    trackShippingInfoEntered({ items, value: 6869, coupon: 'NEW20' });
    trackPaymentInfoAdded({ paymentType: 'card', items, value: 6869, coupon: 'NEW20' });

    expect(window.gtag).toHaveBeenCalledWith('event', 'add_shipping_info', expect.objectContaining({
      currency: 'USD', value: 68.69, coupon: 'NEW20', items: [expect.objectContaining({ price: 34 })],
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', 'add_payment_info', expect.objectContaining({
      currency: 'USD', value: 68.69, payment_type: 'card', coupon: 'NEW20',
    }));
  });

  it('sends a paid order with its canonical transaction, tax, coupon, and gross value', () => {
    trackPurchase({
      transaction_id: 'BOTF-1001',
      value: 6869,
      tax: 389,
      shipping: 0,
      coupon: 'NEW20',
      items: [{ item_id: 'item-1', item_name: 'Banner', price: 3400, quantity: 2 }],
    });

    expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', {
      transaction_id: 'BOTF-1001',
      currency: 'USD',
      value: 68.69,
      tax: 3.89,
      shipping: 0,
      coupon: 'NEW20',
      items: [expect.objectContaining({ item_id: 'item-1', price: 34, quantity: 2 })],
    });
  });
});
