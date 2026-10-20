import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSpecialtyDeliveryEstimate, specialtyDateLabel } from '@/lib/delivery/specialty';
const mocks = vi.hoisted(() => ({ cart: { items: [{product_type: 'banner'}], sameDayHitService: false, saturdayDelivery: false }, countdown: vi.fn() }));
vi.mock('@/store/cart', () => ({useCartStore: () => mocks.cart}));
vi.mock('@/hooks/useDeliveryCountdown', () => ({useDeliveryCountdown: mocks.countdown}));
import CheckoutDeliverySummary from './CheckoutDeliverySummary';
import CheckoutPaymentBar from './CheckoutPaymentBar';

beforeEach(() => {
  mocks.cart.items = [{product_type: 'banner'}];
  mocks.cart.sameDayHitService = false;
  mocks.cart.saturdayDelivery = false;
  const dates = getSpecialtyDeliveryEstimate(new Date('2026-10-20T12:00:00Z'));
  mocks.countdown.mockReturnValue({estimate: dates});
});
describe('compact checkout shipping', () => {
  it('preserves selected rush and Saturday services for the regular date engine', () => {
    mocks.cart.sameDayHitService = true; mocks.cart.saturdayDelivery = true;
    const html = renderToStaticMarkup(<CheckoutDeliverySummary />);
    expect(mocks.countdown).toHaveBeenCalledWith({isHitSelected: true, isSaturdaySelected: true});
    expect(html).toContain('Wed, Oct 21');
    expect(html).toContain('Thu, Oct 22');
    expect(html).not.toContain('role="timer"');
    expect(html).toContain('<details class="checkout-shipping-details">');
    expect(html).toContain('We are not responsible for carrier delays');
  });
  it('keeps both fulfillment groups and the specialty cutoff available in a mixed cart', () => {
    mocks.cart.items.push({product_type: 'specialty'});
    const html = renderToStaticMarkup(<CheckoutDeliverySummary />);
    expect(html).toContain('Banners, yard signs &amp; car magnets');
    expect(html).toContain('Displays &amp; signs');
    expect(html).toContain(specialtyDateLabel(getSpecialtyDeliveryEstimate().deliveryDate));
    expect(html).toContain('role="timer"');
    expect(html).toContain('2 p.m. Pacific / 5 p.m. Eastern');
    expect(html).toContain('may arrive separately');
  });
  it('never advertises free shipping while the quote is pending', () => {
    const html = renderToStaticMarkup(<CheckoutDeliverySummary shippingPending />);
    expect(html).not.toContain('FREE');
    expect(html).toContain('Shipping price pending confirmation');
  });
  it('formats the supplied total without adding a second payment action', () => {
    const html = renderToStaticMarkup(<CheckoutPaymentBar total={7632}><button disabled>Pay $76.32</button></CheckoutPaymentBar>);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('<button disabled="">Pay $76.32</button>');
    expect(html).toContain('<strong>$76.32</strong>');
  });
});
