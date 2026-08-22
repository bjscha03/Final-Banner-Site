import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CheckoutOrderTotals from './CheckoutOrderTotals';

describe('CheckoutOrderTotals', () => {
  it('shows one complete tax-inclusive order total from authoritative cart amounts', () => {
    const html = renderToStaticMarkup(
      <CheckoutOrderTotals
        subtotalCents={14400}
        discountAmountCents={2880}
        discountLabel="Promo NEW20 (20% off)"
        shippingLabel="Shipping"
        taxCents={691}
        totalCents={12211}
      />,
    );

    expect(html).toContain('data-testid="checkout-order-totals"');
    expect(html).toContain('Complete total, including tax');
    expect(html).toContain('$144.00');
    expect(html).toContain('Promo NEW20 (20% off)');
    expect(html).toContain('-$28.80');
    expect(html).toContain('FREE');
    expect(html).toContain('Tax (6%)');
    expect(html).toContain('$6.91');
    expect(html).toContain('Final total');
    expect(html).toContain('$122.11');
  });

  it('includes optional adjustments and service fees without changing their values', () => {
    const html = renderToStaticMarkup(
      <CheckoutOrderTotals
        subtotalCents={12500}
        minOrderAdjustmentCents={2500}
        shippingLabel="Shipping"
        taxCents={600}
        sameDayFeeCents={1800}
        saturdayFeeCents={900}
        totalCents={13300}
      />,
    );

    expect(html).toContain('$100.00');
    expect(html).toContain('Minimum order adjustment');
    expect(html).toContain('$25.00');
    expect(html).toContain('Next-Day Air Included');
    expect(html).toContain('Same-Day Hit Service');
    expect(html).toContain('$18.00');
    expect(html).toContain('Saturday Delivery');
    expect(html).toContain('$9.00');
  });
});
