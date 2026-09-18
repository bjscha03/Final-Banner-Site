import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ShippingBenefitBadge from './ShippingBenefitBadge';
import PriceBreakdown, { type PriceBreakdownProps } from './PriceBreakdown';
import MobileSubtotalBar from '@/components/design/MobileSubtotalBar';

const pricing: PriceBreakdownProps = {
  topLine: '8 sq ft',
  secondaryLine: "for 1 banner · 4' × 2' · 13oz Vinyl",
  baseSubtotalCents: 4000,
  adjustedSubtotalCents: 4000,
  totalCents: 4000,
  taxCents: 0,
  taxCalculatedAtCheckout: true,
};

describe('Free Next-Day Air price benefits', () => {
  it.each(['summary', 'sticky'] as const)('renders the %s badge with a production qualifier and decorative icon', (variant) => {
    const html = renderToStaticMarkup(<ShippingBenefitBadge variant={variant} />);
    expect(html).toContain('data-testid="free-next-day-air-badge"');
    expect(html).toContain(`data-variant="${variant}"`);
    expect(html).toContain('FREE');
    expect(html).toContain('Next-Day Air');
    expect(html).toContain('Shipping after production');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('tomorrow');
    expect(html).not.toContain('Sep 22');
  });

  it.each(['default', 'compact'] as const)('keeps the %s summary amount and tax caption unchanged', (variant) => {
    const html = renderToStaticMarkup(<PriceBreakdown {...pricing} variant={variant} />);
    expect(html).toContain('$40.00');
    expect(html).toContain('Subtotal before tax');
    expect(html.match(/data-testid="free-next-day-air-badge"/g)).toHaveLength(1);
    expect(html).toContain('FREE Next-Day Air');
    expect(html).not.toContain('$42.40');
  });

  it('preserves discounted prices, original prices and separate rush fees', () => {
    const html = renderToStaticMarkup(<PriceBreakdown
      {...pricing}
      variant="compact"
      totalCents={3000}
      adjustedSubtotalCents={3000}
      promoDiscountCents={1000}
      promoDiscountRate={0.25}
      promoDiscountCode="TEST25"
      sameDayHitServiceCents={1500}
      saturdayDeliveryCents={1000}
    />);
    expect(html).toContain('$30.00');
    expect(html).toContain('$40.00');
    expect(html).toContain('You save $10.00');
    expect(html).toContain('TEST25');
    expect(html).toContain('Same-Day Hit Service');
    expect(html).toContain('Saturday Delivery');
    expect(html).toContain('Next-Day Air Included');
  });

  it('keeps the mobile cart count, note, safe area and subtotal next to the compact badge', () => {
    const html = renderToStaticMarkup(<MobileSubtotalBar
      subtotal={<p>$1,234.56</p>}
      priceNote="Popular size preselected"
      cartItemCount={12}
      onViewCart={vi.fn()}
    />);
    expect(html).toContain('$1,234.56');
    expect(html).toContain('View Cart (12)');
    expect(html).toContain('Popular size preselected');
    expect(html).toContain('data-variant="sticky"');
    expect(html).toContain('mobile-subtotal-spacer');
    expect(html).toContain('env(safe-area-inset-bottom, 0.75rem)');
    expect(html).toContain('min-h-11');
  });

  it('does not replace or enable a disabled guided primary action', () => {
    const html = renderToStaticMarkup(<MobileSubtotalBar
      subtotal={<p>$40.00</p>}
      cartItemCount={0}
      onViewCart={vi.fn()}
      primaryAction={{ label: 'Upload artwork', disabled: true, onClick: vi.fn() }}
    />);
    expect(html).toContain('Upload artwork');
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-variant="sticky"');
    expect(html).not.toContain('View Cart (0)');
  });
});
