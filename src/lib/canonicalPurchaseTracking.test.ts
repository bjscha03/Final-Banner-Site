import { describe, expect, it } from 'vitest';
import { buildPurchaseAnalyticsItems } from './canonicalPurchaseTracking';

describe('canonical purchase item mapping', () => {
  it('reports unit price and quantity without multiplying a line total twice', () => {
    expect(buildPurchaseAnalyticsItems('order-1', [{
      id: 'item-1',
      product_type: 'banner',
      material: '13oz',
      width_in: 24,
      height_in: 48,
      quantity: 2,
      line_total_cents: 6800,
    }])).toEqual([expect.objectContaining({
      item_id: 'item-1',
      price: 3400,
      quantity: 2,
    })]);
  });

  it('uses a stable persisted file key when an item UUID is unavailable', () => {
    expect(buildPurchaseAnalyticsItems('order-1', [{
      file_key: 'uploads/banner.pdf',
      quantity: 1,
      line_total_cents: 1900,
    }])[0].item_id).toBe('uploads/banner.pdf');
  });
});
