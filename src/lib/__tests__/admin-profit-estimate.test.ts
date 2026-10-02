import { describe, expect, it, vi } from 'vitest';
import { estimateOrderProfit, estimateSupplierShippingCostCents } from '../admin-profit-estimate';
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

describe('admin supplier cost regressions', () => {
  const sign = (extra: Partial<OrderItem> = {}): Partial<OrderItem> => ({
    product_type: 'yard_sign', width_in: 24, height_in: 18, material: 'corrugated',
    quantity: 10, line_total_cents: 14000, yard_sign_sidedness: 'double', ...extra,
  });
  const banner = (extra: Partial<OrderItem> = {}): Partial<OrderItem> => ({
    product_type: 'banner', width_in: 72, height_in: 24, material: '13oz',
    quantity: 3, line_total_cents: 18000, ...extra,
  });

  it('corrects the double-sided $140 yard-sign order with a $28 discount', () => {
    const profit = estimateOrderProfit({ ...baseOrder([sign()]), applied_discount_cents: 2800 });
    expect(profit).toMatchObject({ needsReview: false, productionCostCents: 5500,
      shippingCostCents: 1000, retailSubtotalCents: 11200, netProfitCents: 4700 });
    expect(profit.marginPct).toBeCloseTo(41.9642857);
  });

  it('uses canonical sidedness before legacy markers while supporting old orders', () => {
    expect(estimateOrderProfit(baseOrder([sign({ yard_sign_sidedness: 'single', grommets: 'double' })])).productionCostCents).toBe(4400);
    expect(estimateOrderProfit(baseOrder([sign({ yard_sign_sidedness: null, grommets: 'double-sided' })])).productionCostCents).toBe(5500);
  });

  it.each([
    { yard_sign_step_stakes_enabled: true },
    { yard_sign_step_stakes_qty: 10 },
    { yard_sign_stakes_subtotal_cents: 1500 },
  ])('does not silently treat unconfigured stakes as free: %j', (extra) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const profit = estimateOrderProfit(baseOrder([sign(extra)]));
    expect(profit.needsReview).toBe(true);
    expect(profit.reviewReasons).toContain('Yard sign stake supplier cost has not been configured');
    warn.mockRestore();
  });

  it.each(['top-bottom', 'top,bottom', 'top|bottom', 'top+bottom', 'top top bottom'])('costs both pocket edges with one setup per line: %s', (position) => {
    const profit = estimateOrderProfit(baseOrder([banner({ pole_pocket_position: position })]));
    // 3 banners × $15 + 3 × 12 linear ft × $1 + one $10 setup.
    expect(profit.productionCostCents).toBe(9100);
    expect(profit.lines[0].addOnCosts).toContainEqual({ label: 'Pole Pockets', costCents: 4600 });
  });

  it('supports legacy pocket selections and vertical edges', () => {
    const profit = estimateOrderProfit(baseOrder([banner({ pole_pockets: 'left-right' })]));
    expect(profit.productionCostCents).toBe(6700);
  });

  it.each([
    ['per_item', 6300], ['per_order', 5100], [undefined, 6300],
  ])('costs rope using saved %s mode and quantity', (mode, expected) => {
    const profit = estimateOrderProfit(baseOrder([banner({ rope_feet: 6, rope_pricing_mode: mode as OrderItem['rope_pricing_mode'] })]));
    expect(profit.productionCostCents).toBe(expected);
    expect(profit.shippingCostCents).toBe(1000);
  });

  it.each([
    { material: '18oz_double' }, { pole_pockets: 'true' }, { quantity: 0 }, { width_in: 0 },
  ])('flags uncosted or incomplete banner configurations: %j', (extra) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(estimateOrderProfit(baseOrder([banner(extra as Partial<OrderItem>)])).needsReview).toBe(true);
    warn.mockRestore();
  });

  it('does not show profit when order items are missing', () => {
    expect(estimateOrderProfit(baseOrder([]))).toMatchObject({ needsReview: true, reviewReasons: ['Order items are missing'] });
  });
});

describe('admin profitability supplier shipping', () => {
  it('charges one supplier shipping fee for a banner-only order with one line item, regardless of quantity', () => {
    const profit = estimateOrderProfit(baseOrder([{
      product_type: 'banner',
      width_in: 24,
      height_in: 36,
      quantity: 2,
      material: '13oz',
      line_total_cents: 6000,
    }]));

    expect(profit.needsReview).toBe(false);
    expect(profit.shippingCostCents).toBe(1000);
    expect(profit.totalCostCents).toBe(profit.productionCostCents + 1000);
    expect(profit.netProfitCents).toBe(profit.adjustedRetailSubtotalCents - profit.totalCostCents);
    expect(profit.marginPct).toBeCloseTo((profit.netProfitCents / profit.adjustedRetailSubtotalCents) * 100, 3);
  });

  it('counts distinct order item rows, not quantity, for supplier shipping', () => {
    const singleRowOrder = baseOrder([{
      product_type: 'banner',
      width_in: 24,
      height_in: 36,
      quantity: 2,
      material: '13oz',
      line_total_cents: 6000,
    }]);
    const differentSizeRowsOrder = baseOrder([
      { product_type: 'banner', width_in: 24, height_in: 36, quantity: 2, material: '13oz', line_total_cents: 6000 },
      { product_type: 'banner', width_in: 48, height_in: 96, quantity: 2, material: '13oz', line_total_cents: 12000 },
    ]);

    expect(estimateSupplierShippingCostCents(singleRowOrder)).toBe(1000);
    expect(estimateSupplierShippingCostCents(differentSizeRowsOrder)).toBe(2000);
  });

  it('charges per line item for mixed banner and magnet orders', () => {
    const profit = estimateOrderProfit(baseOrder([
      { product_type: 'banner', width_in: 24, height_in: 24, quantity: 2, material: '13oz', line_total_cents: 5000 },
      magnetItem('18 x 12', 1, { line_total_cents: 2900 }),
    ]));

    expect(profit.needsReview).toBe(false);
    expect(profit.shippingCostCents).toBe(2000);
    expect(profit.totalCostCents).toBe(profit.productionCostCents + 2000);
  });

  it('charges per line item for banner, magnet, and poster rows even when poster needs review', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const profit = estimateOrderProfit(baseOrder([
      { product_type: 'banner', width_in: 24, height_in: 24, quantity: 2, material: '13oz', line_total_cents: 5000 },
      magnetItem('18 x 12', 1, { line_total_cents: 2900 }),
      { product_type: 'poster', width_in: 18, height_in: 24, quantity: 10, material: '13oz', line_total_cents: 25000, size: '18x24' } as Partial<OrderItem>,
    ]));

    expect(profit.needsReview).toBe(true);
    expect(profit.shippingCostCents).toBe(3000);
    expect(profit.totalCostCents).toBe(profit.productionCostCents + 3000);
    warn.mockRestore();
  });
});

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
    expect(profit.marginPct).toBeCloseTo(47.299, 3);
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
    expect(profit.productionCostCents).toBe(1000 + 2390); // two 4 sq ft banners at $1.25/sq ft
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

describe('BOF Cash reward reserves', () => {
  const merchandise = { product_type:'banner', material:'13oz', width_in:60, height_in:24, quantity:1, line_total_cents:5000 };
  it('budgets a new reward at issuance, then releases the reserve on redemption without counting it twice', () => {
    const original = baseOrder([merchandise]);
    const normal = estimateOrderProfit(original);
    const earning = estimateOrderProfit({...original,bof_reward_reserve_cents:500});
    const spending = estimateOrderProfit({...original,applied_discount_cents:500,bof_reserve_released_cents:500});
    expect(earning.netProfitCents).toBe(normal.netProfitCents-500);
    expect(spending.netProfitCents).toBe(normal.netProfitCents);
    expect(earning.netProfitCents+spending.netProfitCents).toBe(normal.netProfitCents*2-500);
  });
  it('flags refunds and disputes for review instead of displaying a misleading profit',()=>{
    expect(estimateOrderProfit({...baseOrder([merchandise]),bof_profit_review:true}).needsReview).toBe(true);
  });
});
