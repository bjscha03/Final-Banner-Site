import { describe, expect, it } from 'vitest';
import { calculateOrderTotals, generateOrderSummary, type OrderItemInput } from '../order-pricing';
import {
  LARGE_BANNER_PROMOTION_ID,
  LARGE_BANNER_PROMOTION_LABEL,
} from '../largeBannerPromotion';

const item = (
  id: string,
  widthIn: number,
  heightIn: number,
  unitPriceCents: number,
  productType = 'banner',
  quantity = 1,
): OrderItemInput => ({
  id,
  width_in: widthIn,
  height_in: heightIn,
  quantity,
  unit_price_cents: unitPriceCents,
  product_type: productType,
});

describe('shared order-pricing automatic large-banner promotion', () => {
  it('applies the exact automatic promotion metadata to a 6×3 banner', () => {
    const totals = calculateOrderTotals([item('large', 72, 36, 10_000)]);

    expect(totals.subtotal_cents).toBe(10_000);
    expect(totals.applied_discount_type).toBe('promo');
    expect(totals.applied_discount_cents).toBe(2_500);
    expect(totals.applied_discount_label).toBe(LARGE_BANNER_PROMOTION_LABEL);
    expect(totals.applied_promotion_id).toBe(LARGE_BANNER_PROMOTION_ID);
    expect(totals.tax_cents).toBe(450);
    expect(totals.total_cents).toBe(7_950);
  });

  it('does not discount 6×2 or non-banner products', () => {
    const sixByTwo = calculateOrderTotals([item('small', 72, 24, 10_000)]);
    const yardSign = calculateOrderTotals([item('yard', 72, 36, 10_000, 'yard_sign')]);

    expect(sixByTwo.applied_discount_type).toBe('none');
    expect(sixByTwo.applied_discount_cents).toBe(0);
    expect(yardSign.applied_discount_type).toBe('none');
    expect(yardSign.applied_discount_cents).toBe(0);
  });

  it('discounts only qualifying lines in a mixed order', () => {
    const totals = calculateOrderTotals([
      item('large', 96, 36, 12_000),
      item('small', 48, 24, 8_000),
      item('yard', 72, 36, 10_000, 'yard_sign'),
    ]);

    expect(totals.subtotal_cents).toBe(30_000);
    expect(totals.applied_discount_cents).toBe(3_000);
    expect(totals.tax_cents).toBe(1_620);
    expect(totals.total_cents).toBe(28_620);
  });

  it('keeps NEW20 from stacking with or replacing the automatic 25% offer', () => {
    const totals = calculateOrderTotals([
      item('large', 72, 36, 10_000),
      item('small', 48, 24, 10_000),
    ], {
      code: 'NEW20',
      discountPercentage: 20,
    });

    expect(totals.applied_discount_cents).toBe(2_500);
    expect(totals.applied_discount_label).toBe(LARGE_BANNER_PROMOTION_LABEL);
    expect(totals.applied_promotion_id).toBe(LARGE_BANNER_PROMOTION_ID);
    expect(totals.helper_message).toMatch(/cannot be combined/i);
  });

  it('uses the same exact label in generated email/admin summary rows', () => {
    const summary = generateOrderSummary([item('large', 36, 72, 10_000)]);
    const discountRow = summary.find((row) => row.value_cents < 0);

    expect(discountRow).toEqual(expect.objectContaining({
      label: LARGE_BANNER_PROMOTION_LABEL,
      value_cents: -2_500,
    }));
  });
});
