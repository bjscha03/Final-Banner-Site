import { describe, expect, it, vi } from 'vitest';
import { estimateOrderProfit } from '../admin-profit-estimate';
import { normalizeSizeKey, resolveFixedProductCost } from '../admin-product-costs';
import type { Order, OrderItem } from '../orders/types';

const baseOrder = (items: Partial<OrderItem>[]): Order => ({
  id: 'order-test',
  user_id: null,
  status: 'paid',
  subtotal_cents: 0,
  tax_cents: 0,
  total_cents: 0,
  currency: 'usd',
  created_at: '2026-07-09T00:00:00.000Z',
  items: items as OrderItem[],
});

const magnetItem = (size: string, quantity: number, extra: Partial<OrderItem> = {}): Partial<OrderItem> => ({
  product_type: 'car_magnet',
  width_in: Number.NaN,
  height_in: Number.NaN,
  quantity,
  material: 'magnetic',
  line_total_cents: 8700,
  size,
  ...extra,
} as Partial<OrderItem>);

describe('admin profitability fixed product costs', () => {
  it.each([
    ['12x18', '12x18'],
    ['12 x 18', '12x18'],
    ['12" x 18"', '12x18'],
    ['12 in x 18 in', '12x18'],
    ['18x12', '12x18'],
    ['18 x 12', '12x18'],
  ])('normalizes magnet size format %s', (raw, expected) => {
    expect(normalizeSizeKey(raw)).toBe(expected);
  });

  it.each([
    ['12x18', 1195],
    ['24x12', 1495],
    ['24x18', 2095],
    ['42x12', 2995],
    ['72x24', 8970],
  ])('resolves %s magnet supplier cost for quantity 1 and multiples', (size, unitCostCents) => {
    expect(resolveFixedProductCost({ productType: 'car_magnet', rawSize: size, quantity: 1 })).toMatchObject({
      ok: true,
      totalCostCents: unitCostCents,
    });
    expect(resolveFixedProductCost({ productType: 'car_magnet', rawSize: size, quantity: 3 })).toMatchObject({
      ok: true,
      totalCostCents: unitCostCents * 3,
    });
  });

  it('calculates full profit breakdown for magnet orders instead of requiring review', () => {
    const profit = estimateOrderProfit(baseOrder([magnetItem('12" x 18"', 3, { line_total_cents: 8700 })]));

    expect(profit.needsReview).toBe(false);
    expect(profit.originalSubtotalCents).toBe(8700);
    expect(profit.adjustedRetailSubtotalCents).toBe(8700);
    expect(profit.productionCostCents).toBe(3585);
    expect(profit.shippingCostCents).toBe(1000);
    expect(profit.totalCostCents).toBe(4585);
    expect(profit.netProfitCents).toBe(4115);
    expect(profit.marginPct).toBeCloseTo(47.298, 3);
  });

  it('adds banner and magnet production costs for mixed orders', () => {
    const profit = estimateOrderProfit(baseOrder([
      {
        product_type: 'banner',
        width_in: 24,
        height_in: 24,
        quantity: 2,
        material: '13oz',
        line_total_cents: 5000,
      },
      magnetItem('18 x 12', 2, { line_total_cents: 5800 }),
    ]));

    expect(profit.needsReview).toBe(false);
    expect(profit.productionCostCents).toBe(500 + 2390);
    expect(profit.originalSubtotalCents).toBe(10800);
  });

  it('keeps poster orders in review with missing-pricing diagnostics', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const profit = estimateOrderProfit(baseOrder([{
      product_type: 'poster',
      width_in: 18,
      height_in: 24,
      quantity: 1,
      material: '13oz',
      line_total_cents: 2500,
      size: '18x24',
    } as Partial<OrderItem>]));

    expect(profit.needsReview).toBe(true);
    expect(warn).toHaveBeenCalledWith('[admin-profit] Needs review line item', expect.objectContaining({
      productType: 'poster',
      rawSize: '18x24',
      normalizedSize: '18x24',
      quantity: 1,
      reason: 'Missing pricing for poster',
    }));
    warn.mockRestore();
  });
});
