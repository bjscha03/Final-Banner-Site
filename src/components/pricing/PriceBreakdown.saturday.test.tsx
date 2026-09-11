import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PriceBreakdown from './PriceBreakdown';

describe('Saturday product price preview', () => {
  it.each(['default', 'compact'] as const)('shows separate service fees in %s layout', variant => {
    const html = renderToStaticMarkup(<PriceBreakdown variant={variant} topLine="Banner" secondaryLine="1 banner" baseSubtotalCents={8000} adjustedSubtotalCents={8000} taxCents={0} sameDayHitServiceCents={4800} saturdayDeliveryCents={5000} totalCents={17800} taxCalculatedAtCheckout />);
    expect(html).toContain('Saturday Delivery');
    expect(html).toContain('$50.00');
    expect(html).toContain('$48.00');
    expect(html).toContain('$178.00');
  });
});
